import { ChannelType, PermissionFlagsBits as P, type Message, type OmitPartialGroupDMChannel } from 'discord.js';

export type ChatMessage = OmitPartialGroupDMChannel<Message<boolean>>;
export const isDiscordId = (value: unknown): value is string => typeof value === 'string' && /^\d{17,20}$/.test(value);

/** Both parties must be able to see the destination, including private threads. */
export function canShareChannel(message: ChatMessage, channel: any): boolean {
    if (!message.guild) return channel.id === message.channelId;
    if (channel.guildId !== message.guild.id && channel.guild?.id !== message.guild.id) return false;
    const me = message.guild.members.me;
    if (!me || !message.member) return false;
    try {
        const caller = channel.permissionsFor(message.member);
        const bot = channel.permissionsFor(me);
        if (!caller?.has(P.ViewChannel) || !bot?.has(P.ViewChannel)) return false;
        if (channel.type === ChannelType.PrivateThread) {
            if (!caller.has(P.ManageThreads) && !channel.members.cache.has(message.author.id)) return false;
            if (!bot.has(P.ManageThreads) && !channel.members.cache.has(me.id)) return false;
        }
        return true;
    } catch { return false; }
}

export function botCan(message: ChatMessage, channel: any, permission: bigint): boolean {
    if (!message.guild) return channel.id === message.channelId;
    try { return !!message.guild.members.me && !!channel.permissionsFor(message.guild.members.me)?.has(permission); }
    catch { return false; }
}

export async function resolveSharedChannel(message: ChatMessage, channelId?: string): Promise<any | null> {
    if (channelId !== undefined && !isDiscordId(channelId)) return null;
    const id = channelId || message.channelId;
    if (!message.guild) return id === message.channelId ? message.channel : null;
    const channel = id === message.channelId ? message.channel
        : message.guild.channels.cache.get(id) || await message.guild.channels.fetch(id).catch(() => null);
    return channel && canShareChannel(message, channel) ? channel : null;
}
