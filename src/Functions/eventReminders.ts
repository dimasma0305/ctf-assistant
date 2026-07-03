/**
 * Pure decision core for the proactive CTF event-reminder cron.
 *
 * ZERO Discord/Mongo deps on purpose: a cron is near-impossible to verify
 * against live Discord+DB, so all the "should it fire now?" logic lives here as
 * plain functions and is exhaustively unit-tested (see eventReminders.test.ts).
 * The cron (eventReminderCron.ts) is a thin shell that enumerates scheduled
 * events, calls these, and posts.
 *
 * All times are epoch-ms UTC. Display uses Discord relative timestamps
 * (`<t:unix:R>`) so the milestone MATH stays plain UTC and never touches tz
 * formatting.
 */

export const MS = { minute: 60_000, hour: 3_600_000, day: 86_400_000 } as const;

export interface ReminderConfig {
    /** Public countdown offsets before start, in ms (e.g. 24h/3h/1h). */
    publicOffsetsMs: number[];
    /** Private-channel nudge offsets before start, in ms (0 = at start). */
    privateOffsetsMs: number[];
    /** How late a private nudge may still fire after its target (missed-tick grace). */
    privateGraceMs: number;
    /** Activity trigger: messages within the window to count as "overflowing". */
    overflowThreshold: number;
    overflowWindowMs: number;
    /** Only re-surface via activity if an event starts within this horizon. */
    activityHorizonMs: number;
    /** Min gap between an activity re-surface and the last public reminder. */
    activityCooldownMs: number;
}

export const DEFAULT_REMINDER_CONFIG: ReminderConfig = {
    publicOffsetsMs: [24 * MS.hour, 3 * MS.hour, 1 * MS.hour],
    privateOffsetsMs: [0],
    privateGraceMs: 2 * MS.hour,
    overflowThreshold: 30,
    overflowWindowMs: 10 * MS.minute,
    activityHorizonMs: 48 * MS.hour,
    activityCooldownMs: 3 * MS.hour,
};

export const publicKey = (offsetMs: number): string => `pub:${offsetMs}`;
export const privateKey = (offsetMs: number): string => `priv:${offsetMs}`;

export interface PublicDecision {
    /** The single milestone to POST now (most-recently-crossed un-fired), or null. */
    fireKey: string | null;
    fireOffsetMs: number | null;
    /** Older crossed un-fired milestones to mark fired WITHOUT posting (anti-burst). */
    skipKeys: string[];
}

/**
 * Pick at most ONE public countdown milestone to post: the most-recently-crossed
 * un-fired one (smallest offset still ≥ time-to-start). Any larger-offset crossed
 * un-fired milestones are returned in skipKeys to be marked fired silently, so a
 * restart that crossed several at once posts just the current-most-relevant one
 * (whose "starts in X" relative time is always accurate) instead of a burst.
 * Fires nothing once the event has started (now ≥ eventStartMs).
 */
export function decidePublicMilestone(
    now: number,
    eventStartMs: number,
    firedKeys: ReadonlySet<string>,
    config: ReminderConfig,
): PublicDecision {
    const none: PublicDecision = { fireKey: null, fireOffsetMs: null, skipKeys: [] };
    if (now >= eventStartMs) return none;
    // Crossed = now has reached (eventStart - offset), i.e. offset ≥ time-to-start.
    // Sort ascending so the smallest crossed offset (closest to start) is "current".
    const crossedUnfired = config.publicOffsetsMs
        .filter((off) => now >= eventStartMs - off && !firedKeys.has(publicKey(off)))
        .sort((a, b) => a - b);
    if (crossedUnfired.length === 0) return none;
    const fireOffsetMs = crossedUnfired[0];
    const skipKeys = crossedUnfired.slice(1).map(publicKey);
    return { fireKey: publicKey(fireOffsetMs), fireOffsetMs, skipKeys };
}

/**
 * Which private-channel nudges are due now. Each private offset fires once inside
 * its own [target, target+grace) window; past the grace it's skipped (a late
 * "it's starting!" after long downtime is noise). Never fires after the event ends.
 */
export function decidePrivateMilestones(
    now: number,
    eventStartMs: number,
    eventEndMs: number,
    firedKeys: ReadonlySet<string>,
    config: ReminderConfig,
): string[] {
    if (Number.isFinite(eventEndMs) && now >= eventEndMs) return [];
    const due: string[] = [];
    for (const off of config.privateOffsetsMs) {
        const target = eventStartMs - off;
        const key = privateKey(off);
        if (now >= target && now < target + config.privateGraceMs && !firedKeys.has(key)) {
            due.push(key);
        }
    }
    return due;
}

/**
 * True when the count of messages posted in the overflow window meets the
 * threshold. The count MUST come from the uncapped index store
 * (IndexedMessageModel), not the per-channel MessageCache which is hard-capped
 * at 20 — a >20 threshold read from that cache can never trip. The shell applies
 * the `overflowWindowMs` in its query; this stays a trivial pure predicate.
 */
export function isChannelOverflowing(recentCount: number, config: ReminderConfig): boolean {
    return recentCount >= config.overflowThreshold;
}

/**
 * Whether an activity-driven re-surface should fire: the channel is overflowing,
 * a competition starts within the horizon, and we haven't posted a public
 * reminder here recently (unified cooldown, so activity never stacks on top of a
 * countdown milestone that just fired).
 */
export function shouldActivityRemind(
    now: number,
    lastPublicReminderAtMs: number | null,
    overflowing: boolean,
    hasUpcomingWithinHorizon: boolean,
    config: ReminderConfig,
): boolean {
    if (!overflowing || !hasUpcomingWithinHorizon) return false;
    if (lastPublicReminderAtMs != null && now - lastPublicReminderAtMs < config.activityCooldownMs) return false;
    return true;
}

/** Is this event upcoming within the activity horizon (not yet started, within horizon)? */
export function isUpcomingWithinHorizon(now: number, eventStartMs: number, config: ReminderConfig): boolean {
    return eventStartMs > now && eventStartMs - now <= config.activityHorizonMs;
}
