import { Message, OmitPartialGroupDMChannel, PermissionFlagsBits, ChannelType } from 'discord.js';
import { neutralizeControlTokens } from './context';

type ChatMessage = OmitPartialGroupDMChannel<Message<boolean>>;
const clean = (value: string, limit = 180) => neutralizeControlTokens(value).slice(0, limit);

export function getEnvironmentSnapshot(message: ChatMessage) {
    const channel = message.channel as any;
    const me = message.guild?.members.me;
    const permissions = me ? channel.permissionsFor?.(me) : null;
    const has = (bit: bigint) => !!permissions?.has(bit);
    return {
        conversation: message.guild ? 'guild' : 'direct_message',
        currentMessageId: message.id,
        guild: message.guild ? { id: message.guild.id, name: clean(message.guild.name), memberCount: message.guild.memberCount } : null,
        channel: { id: channel.id, name: channel.name ? clean(channel.name) : 'DM',
            topic: channel.topic ? clean(channel.topic, 400) : '',
            category: clean((channel.isThread?.() ? channel.parent?.parent?.name : channel.parent?.name) || ''),
            parent: channel.parent ? { id: channel.parent.id, name: clean(channel.parent.name || '') } : null,
            isThread: !!channel.isThread?.(), nsfw: !!(channel.nsfw || channel.parent?.nsfw) },
        abilities: { sendMessages: !message.guild || has(channel.isThread?.() ? PermissionFlagsBits.SendMessagesInThreads : PermissionFlagsBits.SendMessages),
            readHistory: !message.guild || has(PermissionFlagsBits.ReadMessageHistory),
            manageMessages: !!message.guild && has(PermissionFlagsBits.ManageMessages),
            canRemoveCurrentMessage: !!message.guild && message.deletable && !message.pinned,
            canTryDM: !!message.guild && !message.author.bot },
        limits: 'Only cached Discord data and explicit tools are visible. DM delivery is unknown until attempted. No access to hidden channels, screens, voice, or offline activity.',
    };
}

/** Read-only discovery, constrained by BOTH the caller's and bot's access. */
export async function getEnvironmentForTool(message: ChatMessage, args: any) {
    const snapshot = getEnvironmentSnapshot(message);
    if (!message.guild) return { ok: true, ...snapshot, channels: [], events: [], source: 'direct_message', exhaustive: true };
    const query = typeof args?.query === 'string' ? args.query.toLowerCase().slice(0, 100) : '';
    const guild = message.guild;
    const me = guild.members.me;
    if (!message.member || !me) return { ok: true, ...snapshot, channels: [], events: [], source: 'discord_cache_partial', exhaustive: false };
    const canView = (channel: any) => {
        try {
            const callerPermissions = channel.permissionsFor(message.member);
            const botPermissions = channel.permissionsFor(me);
            if (!callerPermissions?.has(PermissionFlagsBits.ViewChannel) || !botPermissions?.has(PermissionFlagsBits.ViewChannel)) return false;
            if (channel.type === ChannelType.PrivateThread) {
                if (!callerPermissions.has(PermissionFlagsBits.ManageThreads) && !channel.members.cache.has(message.author.id)) return false;
                if (!botPermissions.has(PermissionFlagsBits.ManageThreads) && !channel.members.cache.has(me.id)) return false;
            }
            return true;
        } catch { return false; }
    };
    const channels = [...guild.channels.cache.values()]
        .filter(ch => canView(ch) && (!query || ch.name.toLowerCase().includes(query) || ((ch as any).topic || '').toLowerCase().includes(query)))
        .slice(0, 12)
        .map(ch => ({ id: ch.id, name: clean(ch.name), topic: clean((ch as any).topic || ''), type: ch.type }));
    const events = [...guild.scheduledEvents.cache.values()]
        .filter(event => (!event.scheduledEndTimestamp || event.scheduledEndTimestamp > Date.now())
            && (!event.channelId || (!!event.channel && canView(event.channel)))
            && (!query || event.name.toLowerCase().includes(query)))
        .sort((a, b) => (a.scheduledStartTimestamp || 0) - (b.scheduledStartTimestamp || 0))
        .slice(0, 5)
        .map(event => ({ name: clean(event.name), startsAt: event.scheduledStartAt?.toISOString(), status: event.status, url: event.url }));
    return { ok: true, ...snapshot, channels, events, source: 'discord_cache', exhaustive: false };
}
