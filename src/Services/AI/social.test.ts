process.env.NODB = 'true';

import { afterEach, describe, expect, test } from 'bun:test';
import { applyEmotionChange, formatSocialState, isIgnoring, loadSocialState, mutateSocialState, newSocialState, settleSocialState } from './socialState';
import { getSocialDisposition, ignoreUserForTool, moveConversationToDM, reflectOnInteraction } from './socialTools';
import { shouldRespondToMessage } from './routing';
import { memory } from './memory';
import { maybeReactToMessage } from './reactions';
import { shouldChimeIn } from './spontaneous';

let sequence = 0;
const envNames = ['AI_ALLOW_IGNORING', 'AI_PRIVATE_HANDOFF', 'AI_ALLOW_MESSAGE_REMOVAL'] as const;
const originalEnv = Object.fromEntries(envNames.map(key => [key, process.env[key]]));
afterEach(() => { for (const key of envNames) {
    if (originalEnv[key] === undefined) delete process.env[key]; else process.env[key] = originalEnv[key];
} });

export function makeSocialMessage(options: { dmBlocked?: boolean; deleteFails?: boolean; deletable?: boolean; pinned?: boolean; userId?: string } = {}) {
    const id = String(++sequence);
    const effects: string[] = [];
    const dmMessages: any[] = [];
    const userId = options.userId || `social-user-${id}`;
    const dm = { id: `dm-${userId}`, async send(payload: any) {
        if (options.dmBlocked) throw new Error('Cannot send messages to this user');
        effects.push('dm'); dmMessages.push(payload);
    } };
    const message: any = {
        id: `social-message-${id}`, content: 'hackerika, kamu nyebelin', channelId: `guild-channel-${id}`,
        guildId: 'guild-1', guild: { id: 'guild-1', name: 'CTF Team', members: { me: null } },
        author: { id: userId, username: 'tester', bot: false, async createDM() { return dm; } },
        webhookId: null, system: false, pinned: options.pinned || false, deletable: options.deletable ?? true,
        attachments: new Map(), embeds: [], member: null,
        channel: { id: `guild-channel-${id}`, name: 'general', async send() { effects.push('public'); } },
        async delete() { effects.push('delete'); if (options.deleteFails) throw new Error('Missing permissions'); },
        async react() { effects.push('reaction'); },
    };
    return { message, effects, dm, dmMessages };
}

const handoffArgs = { cause: 'anger', reason: 'personal argument is getting too heated',
    openingMessage: 'aku masih kesel sama cara kamu ngomong tadi. bahas di sini aja.', removeMessage: false };

describe('feelings and boundaries', () => {
    test('feelings cool over time without resetting every turn', () => {
        const start = new Date('2026-10-15T10:00:00Z');
        const state = { ...newSocialState('u', start), anger: 80, hurt: 70, warmth: 60 };
        const settled = settleSocialState(state, new Date('2026-10-15T12:00:00Z'));
        expect(settled.anger).toBe(56); expect(settled.hurt).toBe(58); expect(settled.warmth).toBe(56);
        expect(state.anger).toBe(80);
        expect(settleSocialState(state, new Date('2026-10-20T12:00:00Z')).anger).toBe(0);
        expect(settleSocialState(state, new Date('2026-10-20T12:00:00Z')).warmth).toBe(20);
    });

    test('emotion changes reject arbitrary numbers and missing explanations', () => {
        const state = newSocialState('u');
        for (const n of [NaN, Infinity, 100, -100, '20', undefined]) {
            expect(applyEmotionChange(state, { angerDelta: n, hurtDelta: 0, warmthDelta: 0, reason: 'test' })).toBeNull();
        }
        expect(applyEmotionChange(state, { angerDelta: 2, hurtDelta: 0, warmthDelta: 0, reason: '' })).toBeNull();
        expect(applyEmotionChange(state, { angerDelta: 30, hurtDelta: 10, warmthDelta: -40, reason: 'actual personal insult' })?.warmth).toBe(0);
    });

    test('one reflection per message; different people have separate feelings', async () => {
        const { message } = makeSocialMessage();
        const other = makeSocialMessage();
        const args = { angerDelta: 30, hurtDelta: 5, warmthDelta: -10, reason: 'repeated personal insults' };
        expect((await reflectOnInteraction(message, args)).ok).toBe(true);
        expect((await reflectOnInteraction(message, args)).error).toBe('already_reflected_this_turn');
        expect((await loadSocialState(message.author.id)).anger).toBeCloseTo(30, 1);
        expect((await loadSocialState(other.message.author.id)).anger).toBe(0);
    });

    test('cross-channel updates for the same person do not overwrite each other', async () => {
        const userId = `serial-${++sequence}`;
        await Promise.all(Array.from({ length: 5 }, () => mutateSocialState(userId, state => ({ ...state, anger: state.anger + 5 }))));
        expect((await loadSocialState(userId)).anger).toBeCloseTo(25, 1);
    });

    test('ignore is scoped and expires', () => {
        const now = new Date();
        const state = { ...newSocialState('u'), ignoredUntil: new Date(now.getTime() + 60_000), ignoreChannelId: 'public' };
        expect(isIgnoring(state, 'public', now)).toBe(true);
        expect(isIgnoring(state, 'dm', now)).toBe(false);
        expect(isIgnoring({ ...state, ignoreChannelId: '' }, 'dm', now)).toBe(true);
        expect(isIgnoring(state, 'public', new Date(now.getTime() + 61_000))).toBe(false);
    });

    test('choosing silence suppresses ambient reactions and spontaneous replies', async () => {
        const { message, effects } = makeSocialMessage();
        const result = await ignoreUserForTool(message, { minutes: 15, scope: 'everywhere', reason: 'needs space' });
        expect(result.ok).toBe(true);
        expect(getSocialDisposition(message)).toEqual({ kind: 'ignore', closingMessage: '' });
        expect(await maybeReactToMessage(message, 'bot-id')).toBe(false);
        expect((await shouldChimeIn(message, 'bot-id')).shouldChime).toBe(false);
        expect(effects).toEqual([]);
    });

    test('invalid or disabled ignore never creates a boundary', async () => {
        const { message } = makeSocialMessage();
        for (const minutes of [0, -1, 1.5, 1441, Infinity, '15']) {
            expect((await ignoreUserForTool(message, { minutes, scope: 'everywhere', reason: 'test' })).ok).toBe(false);
        }
        process.env.AI_ALLOW_IGNORING = 'false';
        expect((await ignoreUserForTool(message, { minutes: 10, scope: 'everywhere', reason: 'test' })).error).toBe('ignoring_disabled');
        expect(isIgnoring(await loadSocialState(message.author.id), message.channelId)).toBe(false);
    });
});

describe('private continuation', () => {
    test('DM openings and optional public closings cannot expose internal annotations', async () => {
        const annotation = '\n[Discord chronology: {"sentAt":"now","replyToMessageId":"123"}]';
        const { message, dmMessages, dm } = makeSocialMessage();
        expect((await moveConversationToDM(message, { ...handoffArgs, openingMessage: 'bahas di sini aja.' + annotation })).moved).toBe(true);
        expect(dmMessages[0].content).toBe('bahas di sini aja.');
        expect(JSON.stringify(memory[dm.id].messages)).not.toContain('Discord chronology');
        const boundary = makeSocialMessage();
        await ignoreUserForTool(boundary.message, { minutes: 5, scope: 'channel', reason: 'taking space', closingMessage: 'aku jeda dulu.' + annotation });
        expect(getSocialDisposition(boundary.message)?.closingMessage).toBe('aku jeda dulu.');
    });

    test('a metadata-only private opening is rejected before creating a DM', async () => {
        const { message, effects } = makeSocialMessage();
        expect((await moveConversationToDM(message, { ...handoffArgs, openingMessage: '[Discord chronology: {"sentAt":"now"}]' })).error).toBe('invalid_handoff_arguments');
        expect(effects).toEqual([]);
    });

    test('continues the same conversation and defaults to leaving the message intact', async () => {
        const { message, effects, dm, dmMessages } = makeSocialMessage();
        const result = await moveConversationToDM(message, handoffArgs);
        expect(result.ok).toBe(true); expect(result.deleted).toBe(false);
        expect(effects).toEqual(['dm', 'public']);
        expect(dmMessages[0].allowedMentions).toEqual({ parse: [] });
        expect(memory[dm.id].messages.map(m => m.content)).toEqual([`[${message.author.id}] ${message.content}`, handoffArgs.openingMessage]);
        const state = await loadSocialState(message.author.id);
        expect(formatSocialState(state, dm.id, true)).toContain(message.content);
        expect(formatSocialState(state, dm.id, false)).not.toContain('private-conversation-continuity');
        expect(formatSocialState(state, 'wrong-dm', true)).not.toContain(message.content);
        expect(getSocialDisposition(message)?.kind).toBe('private');
    });

    test('sends the DM before deleting only the current inappropriate message', async () => {
        const { message, effects } = makeSocialMessage();
        const result = await moveConversationToDM(message, { ...handoffArgs, removeMessage: true,
            removalCategory: 'harassment', removalReason: 'repeated targeted personal abuse' });
        expect(result.deleted).toBe(true);
        expect(effects).toEqual(['dm', 'delete', 'public']);
    });

    test('blocked DMs cause no deletion, no public claim, and no private receipt', async () => {
        const { message, effects } = makeSocialMessage({ dmBlocked: true });
        const result = await moveConversationToDM(message, { ...handoffArgs, removeMessage: true,
            removalCategory: 'harassment', removalReason: 'personal abuse' });
        expect(result.error).toBe('dm_unavailable'); expect(effects).toEqual([]);
        expect(getSocialDisposition(message)).toBeUndefined();
        expect((await loadSocialState(message.author.id)).handoff).toBeNull();
    });

    test('deletion failure preserves the successful handoff', async () => {
        const { message } = makeSocialMessage({ deleteFails: true });
        const result = await moveConversationToDM(message, { ...handoffArgs, removeMessage: true,
            removalCategory: 'harassment', removalReason: 'personal abuse' });
        expect(result.ok).toBe(true); expect(result.deleted).toBe(false); expect(result.removalError).toBe('delete_failed');
        expect(getSocialDisposition(message)?.kind).toBe('private');
    });

    test('pinned messages cannot be deleted and removal can be disabled', async () => {
        for (const options of [{ pinned: true }, { deletable: false }, {}]) {
            const { message, effects } = makeSocialMessage(options);
            if (!options.pinned && options.deletable === undefined) process.env.AI_ALLOW_MESSAGE_REMOVAL = 'false';
            const result = await moveConversationToDM(message, { ...handoffArgs, removeMessage: true,
                removalCategory: 'harassment', removalReason: 'personal abuse' });
            expect(result.ok).toBe(true); expect(effects).not.toContain('delete');
        }
    });

    test('being angry or disagreeing is not a valid deletion category', async () => {
        const { message, effects } = makeSocialMessage();
        expect((await moveConversationToDM(message, { ...handoffArgs, removeMessage: true,
            removalCategory: 'disagrees_with_me', removalReason: 'I am angry' })).ok).toBe(false);
        expect(effects).toEqual([]);
    });

    test('repeated calls and concurrent turns cannot spam DMs', async () => {
        const first = makeSocialMessage();
        const second = makeSocialMessage({ userId: first.message.author.id });
        const results = await Promise.all([moveConversationToDM(first.message, handoffArgs), moveConversationToDM(second.message, handoffArgs)]);
        expect(results.filter(r => r.ok)).toHaveLength(1);
        expect((await moveConversationToDM(first.message, handoffArgs)).error).toBe('turn_already_ended');
        expect((await moveConversationToDM(second.message, handoffArgs)).error).toBe('handoff_cooldown');
    });

    test('DM handoffs and webhook/system targets are rejected', async () => {
        for (const changes of [{ guild: null }, { webhookId: 'hook' }, { system: true }]) {
            const { message, effects } = makeSocialMessage(); Object.assign(message, changes);
            expect((await moveConversationToDM(message, handoffArgs)).ok).toBe(false);
            expect(effects).toEqual([]);
        }
    });
});

describe('conversation routing', () => {
    test('DMs work without a mention; bot/system messages do not trigger chat', () => {
        const { message } = makeSocialMessage(); message.guild = null; message.content = 'aku minta maaf soal tadi';
        expect(shouldRespondToMessage(message, null, 'bot')).toBe(true);
        message.author.bot = true;
        expect(shouldRespondToMessage(message, null, 'bot')).toBe(false);
    });

    test('recognizes the actual bot ID, nickname mentions, name, and reply target', () => {
        const { message } = makeSocialMessage();
        for (const text of ['<@new-bot> hi', '<@!new-bot> hi', 'Hackerika hi']) {
            message.content = text; expect(shouldRespondToMessage(message, null, 'new-bot')).toBe(true);
        }
        message.content = 'hi';
        expect(shouldRespondToMessage(message, { author: { id: 'new-bot' } } as any, 'new-bot')).toBe(true);
        expect(shouldRespondToMessage(message, null, 'new-bot')).toBe(false);
    });
});
