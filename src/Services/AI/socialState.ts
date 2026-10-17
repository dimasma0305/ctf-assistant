import mongoose from 'mongoose';
import { SocialStateModel } from '../../Database/connect';
import { isNoDbMode, isTruthyEnv } from '../../utils/env';

export interface PrivateHandoff {
    dmChannelId: string;
    guildId: string;
    guildName: string;
    channelName: string;
    sourceChannelId: string;
    sourceMessageId: string;
    reason: string;
    lastUserMessage: string;
    openingMessage: string;
    startedAt: Date;
    expiresAt: Date;
}

export interface SocialState {
    userId: string;
    anger: number;
    hurt: number;
    warmth: number;
    reason: string;
    updatedAt: Date;
    ignoredUntil: Date | null;
    ignoreChannelId: string;
    ignoreReason: string;
    handoff: PrivateHandoff | null;
}

const states = new Map<string, { state: SocialState; loadedAt: number; dirty: boolean }>();
const pending = new Map<string, Promise<SocialState>>();
const mutations = new Map<string, Promise<unknown>>();
const CACHE_MS = 60_000;
const MAX_CACHED_USERS = 2000;
const clamp = (n: number) => Math.max(0, Math.min(100, n));
const dbAvailable = () => !isNoDbMode() && mongoose.connection.readyState === 1;

export function socialFeatureEnabled(name: string): boolean {
    return process.env[name] === undefined || isTruthyEnv(process.env[name]);
}

export function newSocialState(userId: string, now = new Date()): SocialState {
    return { userId, anger: 0, hurt: 0, warmth: 20, reason: '', updatedAt: now,
        ignoredUntil: null, ignoreChannelId: '', ignoreReason: '', handoff: null };
}

// Feelings settle with elapsed time; one rude message doesn't become a grudge
// forever. Use a copy so reads cannot accidentally mutate a cached state.
export function settleSocialState(state: SocialState, now = new Date()): SocialState {
    const hours = Math.max(0, (now.getTime() - new Date(state.updatedAt).getTime()) / 3_600_000);
    const warmthShift = Math.min(Math.abs(state.warmth - 20), hours * 2);
    return { ...state,
        anger: clamp(state.anger - hours * 12),
        hurt: clamp(state.hurt - hours * 6),
        warmth: clamp(state.warmth + Math.sign(20 - state.warmth) * warmthShift),
        updatedAt: now,
        ignoredUntil: state.ignoredUntil && new Date(state.ignoredUntil) > now ? new Date(state.ignoredUntil) : null,
        handoff: state.handoff && new Date(state.handoff.expiresAt) > now ? { ...state.handoff } : null,
    };
}

function cacheState(state: SocialState, dirty = false) {
    states.delete(state.userId);
    states.set(state.userId, { state, loadedAt: Date.now(), dirty });
    while (states.size > MAX_CACHED_USERS) states.delete(states.keys().next().value!);
}

async function persistState(state: SocialState): Promise<boolean> {
    if (!dbAvailable()) return false;
    const { userId, ...fields } = state;
    try {
        await SocialStateModel.updateOne({ userId }, { $set: fields }, { upsert: true, maxTimeMS: 2000, timeoutMS: 3000 }).exec();
        return true;
    } catch {
        console.warn('[SocialState] write unavailable; boundary is active locally');
        return false;
    }
}

export async function loadSocialState(userId: string): Promise<SocialState> {
    const hit = states.get(userId);
    if (hit && (Date.now() - hit.loadedAt < CACHE_MS || !dbAvailable())) return settleSocialState(hit.state);
    const existing = pending.get(userId);
    if (existing) return existing.then(s => settleSocialState(s));
    const read = (async () => {
        let state = hit?.state || newSocialState(userId);
        // A failed write must not later be replaced by an older DB snapshot.
        // Retry that local state when the DB recovers before refreshing it.
        if (hit?.dirty) {
            cacheState(state, !(await persistState(state)));
            return settleSocialState(state);
        }
        if (dbAvailable()) {
            try {
                const doc = await SocialStateModel.findOne({ userId }).setOptions({ timeoutMS: 3000 }).maxTimeMS(2000).lean().exec();
                if (doc) {
                    // Avoid carrying Mongo's _id/__v into subsequent $set.
                    for (const key of Object.keys(state) as (keyof SocialState)[]) {
                        if ((doc as any)[key] !== undefined) (state as any)[key] = (doc as any)[key];
                    }
                }
            } catch {
                console.warn('[SocialState] read unavailable; using local state');
            }
        }
        cacheState(state);
        return settleSocialState(state);
    })();
    pending.set(userId, read);
    try { return await read; } finally { pending.delete(userId); }
}

// All channels (including DMs) serialize updates for the same person. The
// channel chat queue alone cannot protect a relationship shared across them.
export async function mutateSocialState(
    userId: string,
    mutate: (state: SocialState) => SocialState | Promise<SocialState>,
): Promise<SocialState> {
    const prev = mutations.get(userId) || Promise.resolve();
    const run = prev.catch(() => undefined).then(async () => {
        const next = await mutate(await loadSocialState(userId));
        cacheState(next, true);
        cacheState(next, !(await persistState(next)));
        return next;
    });
    mutations.set(userId, run);
    try { return await run; } finally { if (mutations.get(userId) === run) mutations.delete(userId); }
}

export function isIgnoring(state: SocialState, channelId: string, now = new Date()): boolean {
    return !!state.ignoredUntil && new Date(state.ignoredUntil) > now
        && (!state.ignoreChannelId || state.ignoreChannelId === channelId);
}

export function applyEmotionChange(state: SocialState, args: any, now = new Date()): SocialState | null {
    if (!args || typeof args.reason !== 'string' || !args.reason.trim() || args.reason.length > 240) return null;
    for (const key of ['angerDelta', 'hurtDelta', 'warmthDelta']) {
        if (typeof args[key] !== 'number' || !Number.isFinite(args[key]) || args[key] < -40 || args[key] > 35) return null;
    }
    const settled = settleSocialState(state, now);
    return { ...settled, anger: clamp(settled.anger + args.angerDelta), hurt: clamp(settled.hurt + args.hurtDelta),
        warmth: clamp(settled.warmth + args.warmthDelta), reason: args.reason.trim(), updatedAt: now };
}

export function formatSocialState(state: SocialState, channelId: string, isDM: boolean): string {
    const mood = state.anger >= 65 ? 'angry' : state.hurt >= 60 ? 'hurt'
        : state.anger >= 30 ? 'irritated' : state.warmth >= 50 ? 'warm' : 'calm';
    const lines = [`feelings-toward-current-speaker: ${JSON.stringify({ mood, anger: Math.round(state.anger),
        hurt: Math.round(state.hurt), warmth: Math.round(state.warmth), ...(isDM ? { reason: state.reason } : {}) })}`];
    const h = state.handoff;
    // The private content MUST NEVER be included in a guild prompt, even when
    // it's the same user. Reloading/restarting the bot doesn't change that rule.
    if (isDM && h?.dmChannelId === channelId) lines.push(`private-conversation-continuity: ${JSON.stringify(h)}`);
    return lines.join('\n');
}
