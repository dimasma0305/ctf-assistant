process.env.NODB = 'true';

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { ChannelType, Collection, PermissionFlagsBits as P } from 'discord.js';
import { dispatchDiscordAction, formatCreatorContactReceipt, getDiscordTurnOutcome, guardDiscordActions, takeReadChannelImages, validReactionEmoji } from './discordActions';
import { getChannelCache } from './cache';
import { CREATOR_DISCORD_ID } from './creatorAccess';
import { contactIntentPlanner } from './contactIntent';
import { loadContactOperations } from './contactOperations';

let serial = 0n;
const nextId = () => String(200000000000000000n + ++serial);
const originalFlag = process.env.AI_DISCORD_ACTIONS;
const originalPlanner = contactIntentPlanner.decide;
beforeEach(() => { process.env.AI_DISCORD_ACTIONS = 'true';
    contactIntentPlanner.decide = async () => ({ intent: 'send', audience: 'selected', includeCreator: false, excludeConfirmed: true }); });
afterEach(() => { contactIntentPlanner.decide = originalPlanner;
    if (originalFlag === undefined) delete process.env.AI_DISCORD_ACTIONS; else process.env.AI_DISCORD_ACTIONS = originalFlag; });

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

function contactFixture() {
    const base = fixture();
    base.member.id = CREATOR_DISCORD_ID;
    base.source.author.id = CREATOR_DISCORD_ID;
    const recipients = new Map<string, any>();
    base.guild.members.fetch = async (id: string | object) => typeof id === 'string'
        ? recipients.get(id) || null : new Collection(recipients);
    base.guild.roles.cache = new Collection();
    base.guild.roles.fetch = async (id: string) => base.guild.roles.cache.get(id) || null;
    base.source.client.users = { fetch: async (id: string) => recipients.get(id)?.user || null };
    const addRecipient = (options: { bot?: boolean; dmFails?: boolean; roles?: string[] } = {}) => {
        const id = nextId();
        const dmId = nextId();
        const user = { id, bot: !!options.bot, createDM: async () => ({ id: dmId,
            send: async (payload: any) => {
                if (options.dmFails) throw Object.assign(new Error('closed DMs'), { code: 50007 });
                base.effects.push({ action: 'dm', userId: id, payload });
                return { id: nextId() };
            } }) };
        recipients.set(id, { id, user, roles: { cache: new Collection((options.roles || []).map(roleId => [roleId, { id: roleId }])) } });
        return id;
    };
    const addRole = () => { const id = nextId(); base.guild.roles.cache.set(id, { id }); return id; };
    return { ...base, addRecipient, addRole, recipients };
}

describe('Discord actions', () => {
    test('an all-participants goal uses the current list and includes the creator when requested', async () => {
        const { source, recipients, effects, addRecipient } = contactFixture();
        const ids = Array.from({ length: 4 }, () => addRecipient());
        recipients.set(CREATOR_DISCORD_ID, { id: CREATOR_DISCORD_ID, user: { id: CREATOR_DISCORD_ID, bot: false,
            createDM: async () => ({ send: async (payload: any) => { effects.push({ action: 'dm', userId: CREATOR_DISCORD_ID, payload }); return { id: nextId() }; } }) } });
        source.content = `Joints: <@${CREATOR_DISCORD_ID}> ${ids.map(id => `<@${id}>`).join(' ')}. Ping semua termasuk saya.`;
        contactIntentPlanner.decide = async () => ({ intent: 'send', audience: 'all', includeCreator: true, excludeConfirmed: false });
        const result = await dispatchDiscordAction('creator_contact_members', {
            mode: 'dm', listMessageId: source.id, content: 'Jangan lupa push besok.',
            // A partial model enumeration must not shrink an explicitly-all goal.
            targets: [{ userId: ids[0] }],
        }, source);
        expect(result.deliveredCount).toBe(5);
        expect(new Set(effects.map(effect => effect.userId))).toEqual(new Set([CREATOR_DISCORD_ID, ...ids]));
        expect((await loadContactOperations(source))[0].recipients).toHaveLength(5);
    });

    test('status follow-up cannot send again even if the model selects the send tool', async () => {
        const { source, effects, addRecipient } = contactFixture();
        const sent = addRecipient(), failed = addRecipient({ dmFails: true });
        source.content = `DM <@${sent}> <@${failed}>`;
        const args = { mode: 'dm', content: 'Jangan lupa push.', includeCurrentMentions: true };
        const first = await dispatchDiscordAction('creator_contact_members', args, source);
        expect(first.deliveredCount).toBe(1); expect(first.failedCount).toBe(1);
        const followup = { ...source, id: nextId(), content: 'siapa yang belum ke kirim?' };
        contactIntentPlanner.decide = async () => ({ intent: 'status', audience: 'selected', includeCreator: false, excludeConfirmed: false });
        const result = await dispatchDiscordAction('creator_contact_members', args, followup);
        expect(result.readOnly).toBe(true);
        expect(result.operations[0].recipients.find((r: any) => r.userId === failed).state).toBe('failed');
        expect(effects.filter(e => e.action === 'dm')).toHaveLength(1);
        expect(formatCreatorContactReceipt(result)).toBeNull();
    });

    test('moving the same participant list to DM preserves prior explicit creator inclusion', async () => {
        const { source, channel, recipients, effects, addRecipient } = contactFixture();
        const target = addRecipient();
        recipients.set(CREATOR_DISCORD_ID, { id: CREATOR_DISCORD_ID, user: { id: CREATOR_DISCORD_ID, bot: false,
            createDM: async () => ({ send: async () => { effects.push({ action: 'dm', userId: CREATOR_DISCORD_ID }); return { id: nextId() }; } }) } });
        source.content = `Peserta <@${CREATOR_DISCORD_ID}> <@${target}>. Ping semua termasuk saya.`;
        contactIntentPlanner.decide = async () => ({ intent: 'send', audience: 'all', deliveryMode: 'channel', includeCreator: true, excludeConfirmed: false });
        await dispatchDiscordAction('creator_contact_members', { mode: 'channel', includeCurrentMentions: true, content: 'Reminder' }, source);
        const followup = { ...source, id: nextId(), content: 'ping semua di DM', createdTimestamp: source.createdTimestamp + 1000 };
        channel.messages.fetch = async () => new Collection([[source.id, source]]);
        // The model no longer sees an explicit self mention on this turn.
        contactIntentPlanner.decide = async () => ({ intent: 'send', audience: 'all', deliveryMode: 'dm', includeCreator: false, excludeConfirmed: false });
        const result = await dispatchDiscordAction('creator_contact_members', { mode: 'dm', includeRecentList: true, content: 'Reminder' }, followup);
        expect(result.selected).toBe(2);
        expect(effects.filter(e => e.action === 'dm').map(e => e.userId).sort()).toEqual([CREATOR_DISCORD_ID, target].sort());
        effects.length = 0;
        // Explicit per-recipient enumeration is the same audience source,
        // even without an includeRecentList flag or shared message body.
        contactIntentPlanner.decide = async () => ({ intent: 'send', audience: 'selected', deliveryMode: 'dm', includeCreator: false, excludeConfirmed: false });
        const repeated = await dispatchDiscordAction('creator_contact_members', { mode: 'dm', targets: [
            { userId: CREATOR_DISCORD_ID, content: 'Web reminder' }, { userId: target, content: 'Pwn reminder' },
        ] }, { ...followup, id: nextId() });
        expect(repeated.selected).toBe(2);
        expect(effects.filter(e => e.action === 'dm').map(e => e.userId).sort()).toEqual([CREATOR_DISCORD_ID, target].sort());
    });

    test('individual messages need no shared content when they cover the selected list', async () => {
        const { source, channel, addRecipient, effects } = contactFixture();
        const first = addRecipient(), second = addRecipient(), confirmed = addRecipient();
        const list = { ...source, id: nextId(), content: `List <@${first}> rev <@${second}> pwn <@${confirmed}> web`, createdTimestamp: source.createdTimestamp - 1000 };
        channel.messages.fetch = async (id: any) => typeof id === 'string' ? list : new Collection([[list.id, list]]);
        source.content = 'DM peserta selain yang sudah konfirmasi';
        const result = await dispatchDiscordAction('creator_contact_members', { mode: 'dm', listMessageId: list.id, excludeUserIds: [confirmed],
            targets: [{ userId: first, content: 'Konfirmasi tugas rev-mu ya.' }, { userId: second, content: 'Konfirmasi tugas pwn-mu ya.' }] }, source);
        expect(result.deliveredCount).toBe(2);
        expect(effects.map(e => e.payload.content)).toEqual(['Konfirmasi tugas rev-mu ya.', 'Konfirmasi tugas pwn-mu ya.']);
    });

    test('explicit retry preserves original content and skips successful recipients', async () => {
        const { source, effects, addRecipient, recipients } = contactFixture();
        const sent = addRecipient(), failed = addRecipient({ dmFails: true });
        source.content = `DM <@${sent}> <@${failed}>`;
        await dispatchDiscordAction('creator_contact_members', { mode: 'dm', includeCurrentMentions: true, content: 'Jangan lupa push.' }, source);
        recipients.get(failed).user.createDM = async () => ({ send: async (payload: any) => { effects.push({ action: 'dm', userId: failed, payload }); return { id: nextId() }; } });
        const retry = { ...source, id: nextId(), content: 'coba kirim ulang yang gagal saja' };
        contactIntentPlanner.decide = async () => ({ intent: 'retry', audience: 'selected', includeCreator: false, excludeConfirmed: false });
        const result = await dispatchDiscordAction('retry_contact_members', {}, retry);
        expect(result.deliveredCount).toBe(2); expect(result.failedCount).toBe(0);
        expect(effects.map(e => e.userId)).toEqual([sent, failed]);
        expect(effects[1].payload.content).toBe('Jangan lupa push.');
        await dispatchDiscordAction('retry_contact_members', {}, { ...retry });
        expect(effects).toHaveLength(2);
    });

    test('durable request identity prevents duplicate sends with a fresh message object', async () => {
        const { source, effects, addRecipient } = contactFixture();
        const target = addRecipient(); source.content = `DM <@${target}>`;
        const args = { mode: 'dm', includeCurrentMentions: true, content: 'halo' };
        await dispatchDiscordAction('creator_contact_members', args, source);
        await dispatchDiscordAction('creator_contact_members', args, { ...source });
        expect(effects).toHaveLength(1);
        const foreign = { ...source, author: { ...source.author, id: nextId() } };
        expect((await dispatchDiscordAction('get_contact_status', {}, foreign)).error).toBe('creator_only');
        expect((await dispatchDiscordAction('get_contact_status', {}, { ...source, channelId: nextId() })).operations).toEqual([]);
    });

    test('uncertain network delivery is never automatically retried as failure', async () => {
        const { source, effects, addRecipient, recipients } = contactFixture();
        const target = addRecipient(); source.content = `DM <@${target}>`;
        recipients.get(target).user.createDM = async () => ({ send: async () => { effects.push({ action: 'attempt' }); throw new Error('connection reset after possible delivery'); } });
        const result = await dispatchDiscordAction('creator_contact_members', { mode: 'dm', includeCurrentMentions: true, content: 'halo' }, source);
        expect(result.unknownCount).toBe(1); expect(result.failedCount).toBe(0);
        expect(formatCreatorContactReceipt(result)).toBeNull();
        contactIntentPlanner.decide = async () => ({ intent: 'retry', audience: 'selected', includeCreator: false, excludeConfirmed: false });
        await dispatchDiscordAction('retry_contact_members', {}, { ...source, id: nextId(), content: 'retry' });
        expect(effects).toHaveLength(1);
    });

    test('planner unavailable prevents outbound effects rather than guessing permission', async () => {
        const { source, effects, addRecipient } = contactFixture();
        const target = addRecipient(); source.content = `DM <@${target}>`;
        contactIntentPlanner.decide = async () => { throw new Error('offline'); };
        expect((await dispatchDiscordAction('creator_contact_members', { mode: 'dm', includeCurrentMentions: true, content: 'halo' }, source)).error).toBe('contact_plan_unavailable');
        expect(effects).toEqual([]);
    });

    test('contact receipts report only verified DM outcomes', () => {
        const first = nextId(); const second = nextId();
        expect(formatCreatorContactReceipt({ mode: 'dm', selected: 1, deliveredCount: 1, failedCount: 0,
            results: [{ userId: first, ok: true, messageId: nextId() }] })).toBe('udah, DM-nya terkirim.');
        expect(formatCreatorContactReceipt({ mode: 'dm', selected: 2, deliveredCount: 1, failedCount: 1,
            results: [{ userId: first, ok: true }, { userId: second, ok: false, error: 'dm_unavailable' }] }))
            .toBe('1 dari 2 DM terkirim; 1 belum berhasil.');
        expect(formatCreatorContactReceipt({ mode: 'dm', selected: 1, deliveredCount: 0, failedCount: 1,
            results: [{ userId: first, ok: false, error: 'dm_unavailable' }] })).toBe('DM-nya belum terkirim.');
        expect(formatCreatorContactReceipt({ mode: 'dm', selected: 1, deliveredCount: 1, failedCount: 0,
            results: [{ userId: first, ok: false }] })).toBeNull();
        expect(formatCreatorContactReceipt({ mode: 'channel', selected: 1, deliveredCount: 1, failedCount: 0,
            results: [{ userId: first, ok: true }] })).toBeNull();
    });
    test('only the authenticated creator can contact explicitly mentioned members', async () => {
        const { source, effects, addRecipient } = contactFixture();
        const id = addRecipient();
        const args = { mode: 'dm', targets: [{ userId: id, content: 'hai, lagi apa?' }] };
        source.content = `Rika DM <@${id}>`;
        source.author.id = nextId();
        expect((await dispatchDiscordAction('creator_contact_members', args, source)).error).toBe('creator_only');
        source.author.id = CREATOR_DISCORD_ID;
        source.webhookId = nextId();
        expect((await dispatchDiscordAction('creator_contact_members', args, source)).error).toBe('creator_only');
        source.webhookId = null;
        source.content = 'Rika DM dia yang tadi kutag';
        expect((await dispatchDiscordAction('creator_contact_members', args, source)).error).toBe('recent_list_not_found');
        expect(effects).toEqual([]);
    });

    test('creator can start private conversations with multiple tagged people once', async () => {
        const { source, effects, addRecipient } = contactFixture();
        const first = addRecipient(); const second = addRecipient();
        source.content = `Rika DM <@${first}> dan <@!${second}>`;
        const args = { mode: 'dm', targets: [
            { userId: first, content: 'hai, mau ngobrol?\n[Discord chronology: {"sentAt":"now"}]' },
            { userId: second, content: 'halo, apa kabar?' },
        ] };
        const result = await dispatchDiscordAction('creator_contact_members', args, source);
        expect(result.ok).toBe(true);
        expect(result.results.map((item: any) => [item.userId, item.ok])).toEqual([[first, true], [second, true]]);
        expect(effects.map(item => item.userId)).toEqual([first, second]);
        expect(effects[0].payload.content).toBe('hai, mau ngobrol?');
        expect(effects[0].payload.allowedMentions).toEqual({ parse: [], repliedUser: false });
        expect(getDiscordTurnOutcome(source)).toBeUndefined();
        expect(await dispatchDiscordAction('creator_contact_members', args, source)).toEqual(result);
        expect(effects).toHaveLength(2);
    });

    test('creator can contact more than five people named in the current message', async () => {
        const { source, effects, addRecipient, bot } = contactFixture();
        const ids = Array.from({ length: 8 }, () => addRecipient());
        source.content = `Rika, DM semua yang kutag: <@${bot.id}> ${ids.map(id => `<@${id}>`).join(' ')} @everyone`;
        const result = await dispatchDiscordAction('creator_contact_members', {
            mode: 'dm', includeCurrentMentions: true, content: 'hai, bisa konfirmasi ikut final?',
        }, source);
        expect(result.ok).toBe(true);
        expect(result.selected).toBe(8);
        expect(effects.map(effect => effect.userId)).toEqual(ids);
        expect(effects.every(effect => effect.payload.content === 'hai, bisa konfirmasi ikut final?')).toBe(true);
    });

    test('creator can use a replied list while @everyone stays outside the recipient set', async () => {
        const { source, channel, effects, addRecipient } = contactFixture();
        const ids = Array.from({ length: 6 }, () => addRecipient());
        const listId = nextId();
        const list = { id: listId, channelId: channel.id,
            content: `Joints UGM Finals: ${ids.map(id => `<@${id}>`).join(' ')} @everyone siapa lagi?` };
        channel.messages.fetch = async (arg: any) => typeof arg === 'string' ? arg === listId ? list : null : new Collection();
        source.reference = { messageId: listId };
        source.content = 'Rika DM semua orang yang di list pesan ini untuk konfirmasi';
        const result = await dispatchDiscordAction('creator_contact_members', {
            mode: 'dm', includeReplyMentions: true, content: 'hai, bisa konfirmasi kamu ikut bikin soal?',
        }, source);
        expect(result.ok).toBe(true);
        expect(result.selected).toBe(6);
        expect(effects.map(effect => effect.userId)).toEqual(ids);
    });

    test('creator can point at an earlier same-channel list by its real message ID', async () => {
        const { source, channel, effects, addRecipient } = contactFixture();
        const ids = Array.from({ length: 7 }, () => addRecipient());
        const listId = nextId();
        const list = { id: listId, channelId: channel.id, createdTimestamp: source.createdTimestamp - 1000,
            content: `Finals: ${ids.map(id => `<@${id}>`).join(' ')}` };
        channel.messages.fetch = async (arg: any) => typeof arg === 'string' ? arg === listId ? list : null : new Collection();
        source.content = 'Rika, tolong DM semua orang di list tadi';
        const result = await dispatchDiscordAction('creator_contact_members', {
            mode: 'dm', listMessageId: listId, content: 'bisa konfirmasi ketersediaanmu?',
        }, source);
        expect(result.selected).toBe(7);
        expect(effects.map(effect => effect.userId)).toEqual(ids);
        const wrong = contactFixture();
        wrong.source.content = 'DM orang di list tadi';
        expect((await dispatchDiscordAction('creator_contact_members', {
            mode: 'dm', listMessageId: listId, content: 'hai',
        }, wrong.source)).error).toBe('source_list_unavailable');
    });

    test('"DM mereka kecuali yang sudah confirm" uses the recent creator list and reviews participant replies', async () => {
        const { source, channel, effects, addRecipient } = contactFixture();
        const marc = addRecipient(); const effie = addRecipient(); const merrow = addRecipient();
        const list = { id: nextId(), channelId: channel.id, author: { id: CREATOR_DISCORD_ID },
            createdTimestamp: source.createdTimestamp - 28 * 60_000,
            content: `Joints UGM Finals: <@${CREATOR_DISCORD_ID}> (web), <@${marc}> (rev), <@${effie}> (rev), <@${merrow}> (pwn) @everyone` };
        const reply = { id: nextId(), channelId: channel.id, author: { id: effie },
            createdTimestamp: source.createdTimestamp - 4 * 60_000, content: 'okayy' };
        channel.messages.fetch = async (arg: any) => typeof arg === 'string'
            ? arg === list.id ? list : null
            : new Collection([[list.id, list], [reply.id, reply]]);
        source.content = 'Hackerika kasih mereka dm kecuali yang sudah confirm disini ya';
        const args = { mode: 'dm', includeRecentList: true, content: 'hai, bisa konfirmasi ikut bikin soal Joints UGM Finals?' };
        const preview = await dispatchDiscordAction('creator_contact_members', args, source);
        expect(preview.error).toBe('review_participant_replies');
        expect(preview.sourceListMessageId).toBe(list.id);
        expect(preview.participantReplies).toEqual([{ messageId: reply.id, userId: effie, content: 'okayy' }]);
        expect(effects).toEqual([]);
        const result = await dispatchDiscordAction('creator_contact_members', { ...args, excludeUserIds: [effie] }, source);
        expect(result.ok).toBe(true);
        expect(result.selected).toBe(2);
        expect(effects.map(effect => effect.userId)).toEqual([marc, merrow]);
    });

    test('a direct listMessageId cannot bypass confirmation review', async () => {
        const { source, channel, effects, addRecipient } = contactFixture();
        const marc = addRecipient(); const effie = addRecipient(); const merrow = addRecipient();
        const list = { id: nextId(), channelId: channel.id, author: { id: CREATOR_DISCORD_ID },
            createdTimestamp: source.createdTimestamp - 10_000,
            content: `<@${CREATOR_DISCORD_ID}> <@${marc}> <@${effie}> <@${merrow}>` };
        const reply = { id: nextId(), channelId: channel.id, author: { id: effie },
            createdTimestamp: source.createdTimestamp - 5_000, content: 'okayy' };
        const unrelated = { id: nextId(), channelId: channel.id, author: { id: CREATOR_DISCORD_ID },
            createdTimestamp: source.createdTimestamp - 1_000,
            content: `<@${addRecipient()}> <@${addRecipient()}>` };
        channel.messages.fetch = async (arg: any) => typeof arg === 'string'
            ? arg === list.id ? list : null : new Collection([[list.id, list], [reply.id, reply], [unrelated.id, unrelated]]);
        source.content = 'Rika DM mereka kecuali yang sudah confirm';
        const args = { mode: 'dm', listMessageId: list.id, includeRecentList: true,
            targets: [{ userId: CREATOR_DISCORD_ID, content: 'tolong konfirmasi ya' }], content: 'tolong konfirmasi ya' };
        expect((await dispatchDiscordAction('creator_contact_members', args, source)).error).toBe('review_participant_replies');
        expect(effects).toEqual([]);
        const result = await dispatchDiscordAction('creator_contact_members', { ...args, excludeUserIds: [effie] }, source);
        expect(result.selected).toBe(2);
        expect(effects.map(effect => effect.userId)).toEqual([marc, merrow]);
    });

    test('explicit targets can be grounded in a recent list without replying to it', async () => {
        const { source, channel, effects, addRecipient } = contactFixture();
        const marc = addRecipient(); const merrow = addRecipient();
        const list = { id: nextId(), channelId: channel.id, author: { id: CREATOR_DISCORD_ID },
            createdTimestamp: source.createdTimestamp - 10 * 60_000,
            content: `Joints UGM Finals: <@${marc}> <@${merrow}>` };
        channel.messages.fetch = async (arg: any) => typeof arg === 'string'
            ? arg === list.id ? list : null : new Collection([[list.id, list]]);
        source.content = 'Rika DM mereka ya';
        const result = await dispatchDiscordAction('creator_contact_members', { mode: 'dm', targets: [
            { userId: marc, content: 'Marc, bisa konfirmasi?' },
            { userId: merrow, content: 'Merrow, bisa konfirmasi?' },
        ] }, source);
        expect(result.ok).toBe(true);
        expect(result.sourceListMessageId).toBe(list.id);
        expect(effects.map(effect => effect.userId)).toEqual([marc, merrow]);
    });

    test('recent-list fallback does not authorize a list from another author or channel', async () => {
        const { source, channel, effects, addRecipient } = contactFixture();
        const first = addRecipient(); const second = addRecipient();
        source.content = 'Rika DM mereka';
        const list = { id: nextId(), channelId: channel.id, author: { id: first },
            createdTimestamp: source.createdTimestamp - 1000,
            content: `<@${first}> <@${second}>` };
        channel.messages.fetch = async () => new Collection([[list.id, list]]);
        const args = { mode: 'dm', includeRecentList: true, content: 'halo' };
        expect((await dispatchDiscordAction('creator_contact_members', args, source)).error).toBe('recent_list_not_found');
        list.author.id = CREATOR_DISCORD_ID;
        list.channelId = nextId();
        expect((await dispatchDiscordAction('creator_contact_members', args, source)).error).toBe('recent_list_not_found');
        expect(effects).toEqual([]);
    });

    test('only a role mentioned in the creator message can select actual role members', async () => {
        const { source, effects, addRecipient, addRole } = contactFixture();
        const roleId = addRole();
        const selected = Array.from({ length: 7 }, () => addRecipient({ roles: [roleId] }));
        addRecipient(); addRecipient({ bot: true, roles: [roleId] });
        const args = { mode: 'dm', roleIds: [roleId], content: 'hai, boleh bantu bagian forensik?' };
        source.content = 'Rika DM para anggota role forensik';
        expect((await dispatchDiscordAction('creator_contact_members', args, source)).error).toBe('role_not_mentioned_now');
        expect(effects).toEqual([]);
        source.content = `Rika DM anggota <@&${roleId}>`;
        const result = await dispatchDiscordAction('creator_contact_members', args, source);
        expect(result.selected).toBe(7);
        expect(effects.map(effect => effect.userId)).toEqual(selected);
    });

    test('excluded members are not re-added by role expansion', async () => {
        const { source, effects, addRecipient, addRole } = contactFixture();
        const roleId = addRole();
        const confirmed = addRecipient({ roles: [roleId] });
        const pending = addRecipient({ roles: [roleId] });
        source.content = `Rika DM <@&${roleId}> kecuali yang sudah confirm`;
        const result = await dispatchDiscordAction('creator_contact_members', {
            mode: 'dm', roleIds: [roleId], excludeUserIds: [confirmed], content: 'bisa konfirmasi?',
        }, source);
        expect(result.ok).toBe(true);
        expect(effects.map(effect => effect.userId)).toEqual([pending]);
    });

    test('oversized role expansion rejects before sending any messages', async () => {
        const { source, effects, addRecipient, addRole } = contactFixture();
        const roleId = addRole();
        Array.from({ length: 51 }, () => addRecipient({ roles: [roleId] }));
        source.content = `Rika DM anggota <@&${roleId}>`;
        const result = await dispatchDiscordAction('creator_contact_members', {
            mode: 'dm', roleIds: [roleId], content: 'hai',
        }, source);
        expect(result.error).toBe('too_many_recipients');
        expect(result.max).toBe(50);
        expect(effects).toEqual([]);
    });

    test('a role with exactly fifty human members is accepted', async () => {
        const { source, effects, addRecipient, addRole } = contactFixture();
        const roleId = addRole();
        Array.from({ length: 50 }, () => addRecipient({ roles: [roleId] }));
        source.content = `Rika DM <@&${roleId}>`;
        const result = await dispatchDiscordAction('creator_contact_members', {
            mode: 'dm', roleIds: [roleId], content: 'konfirmasi ya',
        }, source);
        expect(result.ok).toBe(true);
        expect(result.selected).toBe(50);
        expect(result.results.every((item: any) => item.ok)).toBe(true);
        expect(effects).toHaveLength(50);
    });

    test('closed DMs and invalid recipients are reported without claiming delivery', async () => {
        const { source, effects, addRecipient } = contactFixture();
        const closed = addRecipient({ dmFails: true }); const bot = addRecipient({ bot: true });
        source.content = `DM <@${closed}> dan <@${bot}>`;
        const result = await dispatchDiscordAction('creator_contact_members', { mode: 'dm', targets: [
            { userId: closed, content: 'halo' }, { userId: bot, content: 'halo' },
        ] }, source);
        expect(result.ok).toBe(false);
        expect(result.results.map((item: any) => item.error)).toEqual(['dm_unavailable', 'invalid_recipient']);
        expect(effects).toEqual([]);
    });

    test('creator can address visible members in current channel only', async () => {
        const { source, effects, addRecipient } = contactFixture();
        const id = addRecipient();
        source.content = `Rika ajak <@${id}> ngobrol di sini`;
        const args = { mode: 'channel', targets: [{ userId: id, content: 'hai! ngobrol yuk' }] };
        expect((await dispatchDiscordAction('creator_contact_members', args, source)).ok).toBe(true);
        expect(effects[0].payload.content).toBe(`<@${id}> hai! ngobrol yuk`);
        expect(effects[0].payload.allowedMentions).toEqual({ parse: [], users: [id], repliedUser: false });
        expect(getDiscordTurnOutcome(source)?.kind).toBe('delivered');
        const hidden = contactFixture(); const other = hidden.addRecipient();
        hidden.source.content = `Rika sapa <@${other}>`;
        hidden.callerPermissions.delete(P.ViewChannel);
        expect((await dispatchDiscordAction('creator_contact_members', { mode: 'channel', targets: [{ userId: other, content: 'hai' }] }, hidden.source)).error).toBe('channel_not_accessible');
        expect(hidden.effects).toEqual([]);
    });

    test('contact action rejects duplicate targets and stale turns before sending', async () => {
        const { source, effects, addRecipient } = contactFixture();
        const id = addRecipient(); source.content = `DM <@${id}>`;
        const duplicate = { mode: 'dm', targets: [{ userId: id, content: 'a' }, { userId: id, content: 'b' }] };
        expect((await dispatchDiscordAction('creator_contact_members', duplicate, source)).error).toBe('invalid_arguments');
        guardDiscordActions(source, () => false);
        expect((await dispatchDiscordAction('creator_contact_members', { mode: 'dm', targets: [{ userId: id, content: 'hai' }] }, source)).error).toBe('turn_superseded');
        expect(effects).toEqual([]);
    });
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
        expect((await dispatchDiscordAction('read_channel_images', {}, source)).error).toBe('channel_not_accessible');
        expect(effects).toEqual([]);
        const restricted = fixture(); restricted.callerPermissions.delete(P.ReadMessageHistory);
        expect((await dispatchDiscordAction('read_channel_messages', {}, restricted.source)).error).toBe('channel_not_accessible');
        expect((await dispatchDiscordAction('read_channel_images', {}, restricted.source)).error).toBe('channel_not_accessible');
    });

    test('on-demand image read keeps URLs internal and attributes earlier same-channel uploads', async () => {
        const { source, channel } = fixture();
        const now = Date.now(); source.createdTimestamp = now;
        const uploaded = Array.from({ length: 5 }, (_, index) => {
            const id = nextId();
            return { id, channelId: channel.id, createdTimestamp: now - (5 - index) * 1000,
                author: { id: nextId(), username: `member-${index}` }, content: `chart ${index}`,
                attachments: new Collection([[id, { name: `chart-${index}.png`, contentType: 'image/png', size: 2048,
                    url: `https://cdn.discordapp.com/attachments/${channel.id}/${id}/chart-${index}.png?ex=ffffffff` }]]) };
        });
        const foreign = { ...uploaded[4], id: nextId(), channelId: nextId() };
        channel.messages.fetch = async (arg: any) => typeof arg === 'string'
            ? uploaded.find(item => item.id === arg) || foreign.id === arg && foreign || null
            : new Collection([...uploaded, foreign, source].map(item => [item.id, item]));
        const result = await dispatchDiscordAction('read_channel_images', {}, source);
        expect(result.ok).toBe(true);
        expect(result.images).toHaveLength(4);
        expect(result.images[0].sourceMessageId).toBe(uploaded[1].id);
        expect(JSON.stringify(result)).not.toContain('cdn.discordapp.com');
        const refs = takeReadChannelImages(source);
        expect(refs).toHaveLength(4);
        expect(refs[3].authorId).toBe(uploaded[4].author.id);
        expect(takeReadChannelImages(source)).toEqual([]);
        expect((await dispatchDiscordAction('read_channel_images', { messageIds: [uploaded[0].id] }, source)).images[0].sourceMessageId).toBe(uploaded[0].id);
        expect((await dispatchDiscordAction('read_channel_images', { messageIds: ['not-an-id'] }, source)).error).toBe('invalid_arguments');
        expect((await dispatchDiscordAction('read_channel_images', { messageIds: [foreign.id] }, source)).images).toEqual([]);
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
