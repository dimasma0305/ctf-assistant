process.env.NODB = 'true';

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { ChannelType, Collection, PermissionFlagsBits as P } from 'discord.js';
import { dispatchDiscordAction, getDiscordTurnOutcome, guardDiscordActions, validReactionEmoji } from './discordActions';
import { getChannelCache } from './cache';

let serial = 0n;
const nextId = () => String(200000000000000000n + ++serial);
const originalFlag = process.env.AI_DISCORD_ACTIONS;
beforeEach(() => { process.env.AI_DISCORD_ACTIONS = 'true'; });
afterEach(() => { if (originalFlag === undefined) delete process.env.AI_DISCORD_ACTIONS; else process.env.AI_DISCORD_ACTIONS = originalFlag; });

function fixture() {
    const effects: any[] = [];
    const bot = { id: nextId() };
    const member = { id: nextId() };
    const everyone = { id: nextId() };
    const botPermissions = new Set([P.ViewChannel, P.ReadMessageHistory, P.SendMessages, P.SendMessagesInThreads, P.AddReactions, P.AttachFiles, P.CreatePublicThreads, P.PinMessages]);
    const callerPermissions = new Set([P.ViewChannel, P.ReadMessageHistory, P.SendMessages, P.PinMessages]);
    let publicSource = true;
    const guild: any = { id: nextId(), members: { me: bot }, roles: { everyone }, emojis: { cache: new Collection() },
        channels: { cache: new Collection(), fetch: async (id: string) => guild.channels.cache.get(id) || null } };
    const targets = new Collection<string, any>();
    const channel: any = { id: nextId(), guildId: guild.id, guild, type: ChannelType.GuildText, name: 'general', isThread: () => false,
        permissionsFor: (who: any) => ({ has: (bit: bigint) => who?.id === everyone.id ? publicSource && bit === P.ViewChannel : (who?.id === bot.id ? botPermissions : callerPermissions).has(bit) }),
        messages: { fetch: async (arg: any) => typeof arg === 'string' ? targets.get(arg) || null : targets },
        send: async (payload: any) => { effects.push({ action: 'send', payload }); return { id: nextId() }; },
    };
    guild.channels.cache.set(channel.id, channel);
    const source: any = { id: nextId(), channelId: channel.id, guildId: guild.id, guild, channel, member,
        content: 'hackerika lihat ini', author: { id: member.id, username: 'caller', bot: false, tag: 'caller' },
        client: { user: bot }, attachments: new Collection(), embeds: [], createdAt: new Date(), createdTimestamp: Date.now(),
        type: 0, system: false, webhookId: null, reactions: { cache: new Collection() }, pinned: false,
        react: async (emoji: string) => { effects.push({ action: 'react', emoji }); },
        pin: async () => { effects.push({ action: 'pin' }); source.pinned = true; },
        startThread: async ({ name }: any) => { effects.push({ action: 'thread', name }); return { id: nextId(), name }; },
    };
    targets.set(source.id, source);
    const own: any = { ...source, id: nextId(), author: { id: bot.id, username: 'Hackerika', bot: true, tag: 'bot' }, content: 'old answer',
        edit: async ({ content }: any) => { effects.push({ action: 'edit', content }); return { ...own, content }; },
        delete: async () => { effects.push({ action: 'delete' }); },
    };
    targets.set(own.id, own);
    return { source, own, channel, guild, effects, botPermissions, callerPermissions, bot, member, setPrivate: () => { publicSource = false; } };
}

describe('Discord actions', () => {
    test('delivered message ends the turn and does not ping anyone', async () => {
        const { source, effects } = fixture();
        expect((await dispatchDiscordAction('send_discord_message', { content: 'hello @everyone', replyTo: source.id }, source)).ok).toBe(true);
        expect(effects[0].payload.allowedMentions).toEqual({ parse: [], repliedUser: false });
        expect(effects[0].payload.reply.messageReference).toBe(source.id);
        expect(getDiscordTurnOutcome(source)?.kind).toBe('delivered');
        expect((await dispatchDiscordAction('send_discord_message', { content: 'again' }, source)).error).toBe('turn_already_ended');
        expect(effects).toHaveLength(1);
    });

    test('send failure creates no delivered receipt', async () => {
        const { source, channel } = fixture(); channel.send = async () => { throw new Error('closed channel'); };
        expect((await dispatchDiscordAction('send_discord_message', { content: 'hello' }, source)).ok).toBe(false);
        expect(getDiscordTurnOutcome(source)).toBeUndefined();
    });

    test('native sends and edits strip internal annotations before delivery and receipts', async () => {
        const annotation = '\n[Discord chronology: {"sentAt":"now"}]';
        const { source, effects } = fixture();
        expect((await dispatchDiscordAction('send_discord_message', { content: 'Miku wkwk' + annotation }, source)).ok).toBe(true);
        expect(effects[0].payload.content).toBe('Miku wkwk');
        expect(getDiscordTurnOutcome(source)?.content).toBe('Miku wkwk');
        const edit = fixture();
        expect((await dispatchDiscordAction('edit_own_message', { messageId: edit.own.id, content: 'ralat' + annotation }, edit.source)).ok).toBe(true);
        expect(edit.effects[0].content).toBe('ralat');
        const empty = fixture();
        expect((await dispatchDiscordAction('send_discord_message', { content: annotation }, empty.source)).ok).toBe(false);
        expect(empty.effects).toEqual([]);
    });

    test('can correct its own message; cannot edit or delete another person', async () => {
        const { source, own, effects } = fixture();
        expect((await dispatchDiscordAction('edit_own_message', { messageId: source.id, content: 'forged' }, source)).error).toBe('not_own_message');
        expect((await dispatchDiscordAction('delete_own_message', { messageId: source.id }, source)).error).toBe('not_own_message');
        expect((await dispatchDiscordAction('edit_own_message', { messageId: own.id, content: 'correct answer' }, source)).ok).toBe(true);
        expect(effects.map(effect => effect.action)).toEqual(['edit']);
    });

    test('identical mutating retries share one result', async () => {
        const { source, effects } = fixture();
        const results = await Promise.all(Array.from({ length: 3 }, () => dispatchDiscordAction('react_to_message', { emoji: '👏' }, source)));
        expect(results.every(result => result.ok)).toBe(true);
        expect(effects).toHaveLength(1);
        await dispatchDiscordAction('finish_turn', {}, source);
        expect(getDiscordTurnOutcome(source)?.kind).toBe('silent');
    });

    test('can remove only its own reaction', async () => {
        const { source, effects } = fixture();
        source.reactions.cache.set('clap', { emoji: { name: '👏', id: null }, me: true, users: { remove: async () => effects.push({ action: 'unreact' }) } });
        expect((await dispatchDiscordAction('react_to_message', { emoji: '👏', action: 'remove_own' }, source)).ok).toBe(true);
        expect(effects.map(effect => effect.action)).toEqual(['unreact']);
    });

    test('only well formed available emojis are accepted', async () => {
        expect(validReactionEmoji('👩‍💻')).toBe(true); expect(validReactionEmoji('🇮🇩')).toBe(true);
        for (const value of ['hello', '👏🔥', '@everyone', '', '<script>']) expect(validReactionEmoji(value)).toBe(false);
        const { source } = fixture();
        expect((await dispatchDiscordAction('react_to_message', { emoji: '<:missing:123456789012345678>' }, source)).error).toBe('emoji_not_available');
    });

    test('visibility and real bot permissions gate reads/actions', async () => {
        const { source, botPermissions, callerPermissions, effects } = fixture();
        botPermissions.delete(P.AddReactions);
        expect((await dispatchDiscordAction('react_to_message', { emoji: '👏' }, source)).ok).toBe(false);
        callerPermissions.delete(P.ViewChannel);
        expect((await dispatchDiscordAction('read_channel_messages', {}, source)).error).toBe('channel_not_accessible');
        expect(effects).toEqual([]);
    });

    test('pins require both the bot and initiating member permission', async () => {
        const { source, callerPermissions, effects } = fixture();
        callerPermissions.delete(P.PinMessages);
        expect((await dispatchDiscordAction('pin_discord_message', {}, source)).error).toBe('pin_permission_required');
        callerPermissions.add(P.PinMessages);
        expect((await dispatchDiscordAction('pin_discord_message', {}, source)).ok).toBe(true);
        expect(effects.map(effect => effect.action)).toEqual(['pin']);
    });

    test('cannot post into another channel where the initiating member can only read', async () => {
        const { source, channel, guild, member, effects } = fixture();
        const readOnly = { ...channel, id: nextId(), permissionsFor: (who: any) => who?.id === member.id
            ? { has: (bit: bigint) => [P.ViewChannel, P.ReadMessageHistory].includes(bit) } : channel.permissionsFor(who) };
        guild.channels.cache.set(readOnly.id, readOnly);
        expect((await dispatchDiscordAction('send_discord_message', { channelId: readOnly.id, content: 'unauthorized announcement' }, source)).error).toBe('channel_not_accessible');
        expect(effects).toEqual([]);
    });

    test('actions in another channel require an exact target ID', async () => {
        const { source, channel, guild, effects } = fixture();
        const other = { ...channel, id: nextId(), messages: { fetch: async () => { throw new Error('must not fetch an unspecified target'); } } };
        guild.channels.cache.set(other.id, other);
        expect((await dispatchDiscordAction('react_to_message', { channelId: other.id, emoji: '👏' }, source)).error).toBe('message_not_found');
        expect(effects).toEqual([]);
    });

    test('creates a public thread once and reuses an existing thread', async () => {
        const { source, effects } = fixture();
        expect((await dispatchDiscordAction('start_discord_thread', { name: 'SQLi discussion' }, source)).ok).toBe(true);
        await dispatchDiscordAction('start_discord_thread', { name: 'SQLi discussion' }, source);
        expect(effects).toHaveLength(1);
        const another = fixture(); another.source.hasThread = true; another.source.thread = { id: nextId() };
        expect((await dispatchDiscordAction('start_discord_thread', { name: 'existing' }, another.source)).existing).toBe(true);
        expect(another.effects).toEqual([]);
    });

    test('generated file stays in memory and rejects file paths and oversized content', async () => {
        const { source, effects } = fixture();
        expect((await dispatchDiscordAction('share_text_file', { filename: '../../.env', text: 'data' }, source)).ok).toBe(false);
        expect((await dispatchDiscordAction('share_text_file', { filename: 'solve.py', text: 'x'.repeat(32001) }, source)).ok).toBe(false);
        expect((await dispatchDiscordAction('share_text_file', { filename: 'solve.py', text: 'print(1)' }, source)).ok).toBe(true);
        expect(effects[0].payload.files[0].name).toBe('solve.py');
        expect(effects[0].payload.files[0].attachment.toString()).toBe('print(1)');
    });

    test('DM and private source content cannot be sent to another audience', async () => {
        const { source, channel, guild, setPrivate, effects } = fixture();
        const other = { ...channel, id: nextId() }; guild.channels.cache.set(other.id, other);
        setPrivate();
        expect((await dispatchDiscordAction('send_discord_message', { channelId: other.id, content: 'private' }, source)).error).toBe('private_source_cannot_cross_channel');
        source.guild = null;
        expect((await dispatchDiscordAction('send_discord_message', { channelId: other.id, content: 'DM contents' }, source)).ok).toBe(false);
        expect(effects).toEqual([]);
    });

    test('edited/deleted/superseded sources cannot perform a delayed mutation', async () => {
        const { source, channel, effects } = fixture();
        let valid = true;
        guardDiscordActions(source, () => valid);
        channel.send = async () => { effects.push('sent'); return { id: nextId() }; };
        const action = dispatchDiscordAction('send_discord_message', { content: 'stale answer' }, source);
        valid = false;
        expect((await action).ok).toBe(false); expect(effects).toEqual([]);
    });

    test('cache updates replace the old version of a message in NODB mode', async () => {
        const { source, own } = fixture();
        const { updateChannelCache } = await import('./cache');
        await updateChannelCache(own); await updateChannelCache({ ...own, content: 'updated answer' });
        expect((await getChannelCache(source.channelId)).filter(message => message.id === own.id).map(message => message.content)).toEqual(['updated answer']);
    });
});
