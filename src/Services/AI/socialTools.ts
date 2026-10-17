import { Message, OmitPartialGroupDMChannel, MessageFlags } from 'discord.js';
import { neutralizeControlTokens } from './context';
import { memory } from './memory';
import { forgetCachedMessage } from './cache';
import { applyEmotionChange, isIgnoring, loadSocialState, mutateSocialState, socialFeatureEnabled } from './socialState';
import { stripInternalAnnotations } from './output';

type ChatMessage = OmitPartialGroupDMChannel<Message<boolean>>;
export type SocialDisposition = { kind: 'private' | 'ignore'; dmChannelId?: string; deleted?: boolean; closingMessage?: string };
const dispositions = new WeakMap<object, SocialDisposition>();
const reflectedMessages = new WeakSet<object>();
const handoffsInFlight = new Set<string>();
const HANDOFF_COOLDOWN_MS = 10 * 60_000;
const PRIVATE_CONTEXT_MS = 24 * 60 * 60_000;
const validRemovalReasons = new Set(['harassment', 'hate', 'sexual_harassment', 'exposed_private_information']);

export const getSocialDisposition = (message: object) => dispositions.get(message);

function shortText(value: unknown, max: number): value is string {
    return typeof value === 'string' && !!value.trim() && value.length <= max;
}

export async function reflectOnInteraction(message: ChatMessage, args: any) {
    if (reflectedMessages.has(message)) return { ok: false, error: 'already_reflected_this_turn' };
    // Validate before setting the guard so a malformed tool call can be fixed.
    if (!applyEmotionChange(await loadSocialState(message.author.id), args)) return { ok: false, error: 'invalid_emotion_change' };
    reflectedMessages.add(message);
    const state = await mutateSocialState(message.author.id, current => applyEmotionChange(current, args)!);
    return { ok: true, feelings: { anger: Math.round(state.anger), hurt: Math.round(state.hurt), warmth: Math.round(state.warmth) } };
}

export async function ignoreUserForTool(message: ChatMessage, args: any) {
    if (!socialFeatureEnabled('AI_ALLOW_IGNORING')) return { ok: false, error: 'ignoring_disabled' };
    if (dispositions.has(message)) return { ok: false, error: 'turn_already_ended' };
    if (!Number.isInteger(args?.minutes) || args.minutes < 1 || args.minutes > 1440
        || !shortText(args?.reason, 240) || !['channel', 'everywhere'].includes(args?.scope)
        || (args.closingMessage !== undefined && (typeof args.closingMessage !== 'string' || args.closingMessage.length > 500))) {
        return { ok: false, error: 'invalid_boundary', detail: 'minutes: integer 1..1440; scope: channel|everywhere; reason: 1..240 chars; optional closingMessage <=500 chars' };
    }
    const until = new Date(Date.now() + args.minutes * 60_000);
    await mutateSocialState(message.author.id, state => ({ ...state, ignoredUntil: until,
        ignoreChannelId: args.scope === 'channel' ? message.channelId : '', ignoreReason: args.reason.trim() }));
    dispositions.set(message, { kind: 'ignore', closingMessage: stripInternalAnnotations(neutralizeControlTokens(args.closingMessage || '')) });
    return { ok: true, ignoredUntil: until.toISOString(), scope: args.scope, stopReply: true };
}

export async function moveConversationToDM(message: ChatMessage, args: any) {
    if (!socialFeatureEnabled('AI_PRIVATE_HANDOFF')) return { ok: false, error: 'private_handoff_disabled' };
    if (!message.guild || message.author.bot || message.webhookId || message.system) return { ok: false, error: 'guild_user_message_required' };
    if (dispositions.has(message)) return { ok: false, error: 'turn_already_ended' };
    if (!shortText(args?.reason, 240) || !shortText(args?.openingMessage, 1800)
        || !['anger', 'hurt', 'personal_conflict', 'sensitive_topic'].includes(args?.cause)
        || typeof args?.removeMessage !== 'boolean'
        || (args.removeMessage && (!validRemovalReasons.has(args?.removalCategory) || !shortText(args?.removalReason, 240)))) {
        return { ok: false, error: 'invalid_handoff_arguments' };
    }
    const userId = message.author.id;
    if (handoffsInFlight.has(userId)) return { ok: false, error: 'handoff_in_progress' };
    handoffsInFlight.add(userId);
    try {
        const state = await loadSocialState(userId);
        if (isIgnoring(state, message.channelId)) return { ok: false, error: 'taking_space' };
        if (state.handoff && Date.now() - new Date(state.handoff.startedAt).getTime() < HANDOFF_COOLDOWN_MS) {
            return { ok: false, error: 'handoff_cooldown', detail: 'A private conversation was already opened recently. Do not keep DMing.' };
        }
        const opening = stripInternalAnnotations(neutralizeControlTokens(args.openingMessage.trim()));
        if (!opening) return { ok: false, error: 'invalid_handoff_arguments' };
        let dm;
        try {
            dm = await message.author.createDM();
            // Send first. Closed DMs must not cause the public message to be
            // removed or create a fictional successful private conversation.
            await dm.send({ content: opening, allowedMentions: { parse: [] }, flags: MessageFlags.SuppressEmbeds });
        } catch {
            return { ok: false, error: 'dm_unavailable', detail: 'No private message was delivered; nothing was deleted. Set a short boundary publicly or take space.' };
        }

        // From this point the public turn is finished, even if cleanup fails.
        // The chat loop reads this receipt directly, never trusts model prose.
        const disposition: SocialDisposition = { kind: 'private', dmChannelId: dm.id, deleted: false };
        dispositions.set(message, disposition);
        const lastUserMessage = neutralizeControlTokens(message.content || '').slice(0, 1800);
        const now = new Date();
        await mutateSocialState(userId, current => ({ ...current, handoff: {
            dmChannelId: dm.id, guildId: message.guild!.id, guildName: neutralizeControlTokens(message.guild!.name),
            channelName: neutralizeControlTokens((message.channel as any).name || ''),
            sourceChannelId: message.channelId, sourceMessageId: message.id, reason: neutralizeControlTokens(args.reason),
            lastUserMessage, openingMessage: opening, startedAt: now, expiresAt: new Date(now.getTime() + PRIVATE_CONTEXT_MS),
        } }));
        // Carry only the current speaker's message and her actual delivered
        // reply. Other people's conversation is never copied to a private DM.
        const thread = memory[dm.id] ||= { messages: [], lastAccessed: Date.now() };
        thread.messages.push({ role: 'user', content: `[${userId}] ${lastUserMessage}` }, { role: 'assistant', content: opening });
        thread.messages = thread.messages.slice(-20);
        thread.lastAccessed = Date.now();

        let removalError: string | undefined;
        if (args.removeMessage) {
            if (!socialFeatureEnabled('AI_ALLOW_MESSAGE_REMOVAL')) removalError = 'message_removal_disabled';
            else if (message.pinned || !message.deletable) removalError = 'message_not_deletable';
            else {
                try {
                    await message.delete();
                    disposition.deleted = true;
                    // Prevent deleted material from reappearing in recall.
                    await forgetCachedMessage(message.channelId, message.id);
                } catch {
                    removalError = 'delete_failed';
                }
            }
        }
        // Keep the public footprint brief; never repeat private content or
        // publicly scold/name the user. Failure cannot undo a delivered DM.
        try { await message.channel.send({ content: 'aku lanjut ngobrol di DM ya.', allowedMentions: { parse: [] } }); } catch { /* missing SendMessages */ }
        console.log(`[Social] private handoff source=${message.id} deleted=${disposition.deleted} category=${args.removeMessage ? args.removalCategory : 'none'}`);
        return { ok: true, moved: true, dmChannelId: dm.id, deleted: disposition.deleted, removalError, stopReply: true };
    } finally {
        handoffsInFlight.delete(userId);
    }
}
