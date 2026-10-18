import type { Message, OmitPartialGroupDMChannel } from 'discord.js';
import { extractMentionIds } from './mentions';
import { neutralizeControlTokens } from './context';

type ChatMessage = OmitPartialGroupDMChannel<Message<boolean>>;
const clean = (value: unknown, max = 100) => typeof value === 'string'
    ? neutralizeControlTokens(value).replace(/[\r\n\t]/g, ' ').trim().slice(0, max) : '';

/** Only an explicit mention in this message (or the speaker) may be inspected. */
export function discordProfileSubject(message: Pick<ChatMessage, 'content' | 'author' | 'client'>, requestedId?: string): string | null {
    const mentions = extractMentionIds(message.content).filter(id => id !== message.client.user?.id);
    const candidates = [...new Set([message.author.id, ...mentions])];
    if (requestedId) return /^\d{17,20}$/.test(requestedId) && candidates.includes(requestedId) ? requestedId : null;
    if (!mentions.length && /\b(?:profilku|profile\s+me|my\s+profile|akun\s+(?:aku|saya)|profil\s+(?:aku|saya))\b/i.test(message.content)) return message.author.id;
    return mentions.length === 1 ? mentions[0] : null;
}

/** A person/profile question about exactly one tagged member. Keep CTF team
 * mentions and ordinary name references out of this research path. */
export function discordPersonResearchSubject(message: Pick<ChatMessage, 'content' | 'author' | 'client'>): string | null {
    const id = discordProfileSubject(message);
    if (!id || id === message.author.id) return null;
    const direct = /\b(?:siapa(?:\s+(?:itu|dia))?|who\s+is|profil(?:e)?(?:\s+discord)?|identitas(?:\s+akun)?)\s*<@!?(\d{17,20})>/i.exec(message.content);
    return direct?.[1] === id ? id : null;
}

export interface DiscordProfile {
    id: string; username: string; globalName: string | null; bot: boolean;
    accountCreatedAt: string; accountCreatedAtBasis: 'discord_snowflake';
    avatarUrl: string | null; bannerUrl: string | null; publicFlags: string[];
    guild: { id: string; displayName: string; nickname: string | null; joinedAt: string | null;
        roles: string[]; avatarUrl: string | null; bannerUrl: string | null };
}

export async function getDiscordProfileForTool(message: ChatMessage, args: { userId?: string } = {}): Promise<
    { ok: true; source: 'discord_api'; profile: DiscordProfile; limitations: string } |
    { ok: false; error: string }
> {
    const id = discordProfileSubject(message, args.userId);
    if (!id) return { ok: false, error: 'mention_one_target_in_current_message' };
    if (!message.guild) return { ok: false, error: 'guild_context_required' };
    try {
        // Guild membership is the access boundary. No mutual-guild, private DM,
        // OAuth connection or undocumented user-profile endpoint is queried.
        const member = await message.guild.members.fetch(id);
        if (!member) return { ok: false, error: 'target_not_in_current_guild' };
        const user = await message.client.users.fetch(id, { force: true }).catch(() => member.user);
        const roles = member.roles.cache
            .filter(role => role.id !== message.guild!.id)
            .sort((a, b) => b.position - a.position)
            .map(role => clean(role.name, 80))
            .filter(Boolean).slice(0, 16);
        return { ok: true, source: 'discord_api', profile: {
            id, username: clean(user.username, 80), globalName: clean(user.globalName, 80) || null,
            bot: user.bot, accountCreatedAt: user.createdAt.toISOString(), accountCreatedAtBasis: 'discord_snowflake',
            avatarUrl: user.avatarURL() || null, bannerUrl: user.bannerURL() || null,
            publicFlags: user.flags?.toArray().slice(0, 16) || [],
            guild: { id: message.guild.id, displayName: clean(member.displayName, 80),
                nickname: clean(member.nickname, 80) || null, joinedAt: member.joinedAt?.toISOString() || null,
                roles, avatarUrl: member.avatarURL() || null, bannerUrl: member.bannerURL() || null },
        }, limitations: 'Discord API fields visible to this bot in the current guild. Creation time is inferred from the account ID. Bio, connected accounts, private activity and other guilds are unavailable; matching usernames on websites do not prove identity.' };
    } catch {
        return { ok: false, error: 'discord_profile_unavailable_or_not_in_guild' };
    }
}
