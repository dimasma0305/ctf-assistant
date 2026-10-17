import type { Guild, GuildMember } from "discord.js";
import { neutralizeControlTokens } from './context';

const MENTION_REGEX = /<@!?(\d{17,20})>/g;
const MAX_RESOLVED = 10;       // cap on legend entries per turn to bound prompt size
const MAX_ROLES_PER_USER = 3;

export interface MentionReference {
    id: string;
    displayName?: string;
    username?: string;
    isBot?: boolean;
}
export interface ResolvedUser extends MentionReference { roles: string[] }
type MentionMessage = { content: string; mentions?: any; guild?: any };
const cleanName = (value: unknown) => typeof value === 'string'
    ? neutralizeControlTokens(value).replace(/[\r\n\t]/g, ' ').slice(0, 80) : '';

/** Discord's mention payload already includes users who have never spoken.
 * Only explicit user tokens in the content count; an implicit reply ping,
 * role mention or @everyone does not become the subject of the message. */
export function mentionReferences(message: MentionMessage): MentionReference[] {
    return extractMentionIds(message.content).map(id => {
        const member = message.mentions?.members?.get(id) || message.guild?.members?.cache?.get(id);
        const user = message.mentions?.users?.get(id) || member?.user;
        const displayName = cleanName(member?.displayName || user?.globalName || user?.username);
        const username = cleanName(user?.username);
        return { id, ...(displayName ? { displayName } : {}), ...(username ? { username } : {}),
            ...(typeof user?.bot === 'boolean' ? { isBot: user.bot } : {}) };
    });
}

/**
 * Extract unique <@ID> / <@!ID> Discord user mentions across any number of
 * text inputs. Capped at MAX_RESOLVED to bound the resolution cost.
 */
export function extractMentionIds(...texts: (string | null | undefined)[]): string[] {
    const ids = new Set<string>();
    for (const t of texts) {
        if (!t) continue;
        for (const m of t.matchAll(MENTION_REGEX)) {
            ids.add(m[1]);
            if (ids.size >= MAX_RESOLVED) break;
        }
        if (ids.size >= MAX_RESOLVED) break;
    }
    return Array.from(ids);
}

function makeResolved(m: GuildMember): ResolvedUser {
    const roles = m.roles.cache
        .filter((r) => r.name !== '@everyone')
        .map((r) => cleanName(r.name))
        .slice(0, MAX_ROLES_PER_USER);
    return {
        id: m.id,
        displayName: cleanName(m.displayName),
        username: cleanName(m.user.username),
        roles,
        isBot: m.user.bot,
    };
}

/**
 * Resolve at most ten IDs using current guild members, Discord payloads and
 * channel-scoped snapshots, then one time-bounded bulk fetch for misses.
 *
 * Unresolved IDs retain an empty identity rather than a guessed name.
 */
export async function resolveUsers(guild: Guild | null, ids: string[], seeds: MentionReference[] = [], timeoutMs = 3000): Promise<Map<string, ResolvedUser>> {
    const map = new Map<string, ResolvedUser>();
    const uniqueIds = [...new Set(ids)].filter(id => /^\d{17,20}$/.test(id)).slice(0, MAX_RESOLVED);
    const seedMap = new Map<string, MentionReference>();
    for (const seed of seeds) if (!seedMap.has(seed.id) && (seed.displayName || seed.username)) seedMap.set(seed.id, seed);

    const toFetch: string[] = [];
    for (const id of uniqueIds) {
        const cached = guild?.members.cache.get(id);
        const seed = seedMap.get(id);
        if (cached) {
            map.set(id, makeResolved(cached));
        } else if (seed) {
            map.set(id, { id, displayName: cleanName(seed.displayName), username: cleanName(seed.username),
                ...(typeof seed.isBot === 'boolean' ? { isBot: seed.isBot } : {}), roles: [] });
        } else {
            map.set(id, { id, roles: [] });
            toFetch.push(id);
        }
    }

    if (guild && toFetch.length > 0) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
            const deadline = Math.max(10, Math.min(3000, timeoutMs));
            const fetched = await Promise.race([
                guild.members.fetch({ user: toFetch, time: deadline }),
                new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), deadline); }),
            ]);
            if (!fetched) return map;
            for (const member of fetched.values()) {
                if (map.has(member.id)) map.set(member.id, makeResolved(member));
            }
        } catch {
            console.warn('[Mentions] member lookup unavailable; retaining known payload identities');
            // Fall through with whatever we've got from cache.
        } finally { if (timer) clearTimeout(timer); }
    }

    return map;
}

/**
 * Build a compact JSON legend of user identities and mention source messages.
 * Returns an empty string if no users resolved.
 */
export function buildMentionLegend(resolved: Map<string, ResolvedUser>, references?: {
    assistantId: string; currentMessageId: string; currentTargets: string[];
    recent: { messageId?: string; authorId?: string; sameSpeaker: boolean; targets: string[] }[];
}): string {
    if (resolved.size === 0) return '';
    return JSON.stringify({ users: [...resolved.values()].map(u => ({ ...u,
        displayName: cleanName(u.displayName) || undefined, username: cleanName(u.username) || undefined,
        roles: u.roles.map(cleanName).slice(0, MAX_ROLES_PER_USER), resolved: !!(u.displayName || u.username) })),
        ...(references ? { references } : {}) });
}
