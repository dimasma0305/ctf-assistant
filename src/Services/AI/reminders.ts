import { OmitPartialGroupDMChannel, Message as DiscordMessage } from "discord.js";
import { ReminderModel, UserProfileModel } from "../../Database/connect";
import { MyClient } from "../../Model/client";

export const DEFAULT_TIMEZONE = 'Asia/Jakarta';

const MAX_ACTIVE_PER_USER = 25;
const MAX_CONTENT_CHARS = 500;
const MIN_LEAD_SECONDS = 5;                       // can't schedule for < 5s in the future
const MAX_LEAD_DAYS = 365;                        // can't schedule > 1 year out
const MAX_LEAD_MS = MAX_LEAD_DAYS * 86_400_000;

/**
 * Validate an IANA timezone via the Intl API. Invalid zones throw on
 * construction, which we catch and translate.
 */
export function isValidIanaTimezone(tz: string): boolean {
    if (typeof tz !== 'string' || tz.length === 0 || tz.length > 64) return false;
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: tz });
        return true;
    } catch {
        return false;
    }
}

/** Read a user's IANA timezone, falling back to community default. */
export async function loadUserTimezone(userId: string): Promise<string> {
    try {
        const doc = await UserProfileModel.findOne({ userId }).select({ timezone: 1 }).lean();
        const tz = (doc as any)?.timezone;
        if (typeof tz === 'string' && tz.length > 0 && isValidIanaTimezone(tz)) return tz;
    } catch (error) {
        console.error('[Reminder] failed to read user timezone:', error);
    }
    return DEFAULT_TIMEZONE;
}

/**
 * Format a UTC `Date` as a human-readable local-time string in the given
 * IANA zone. Example: "18 May 2026 09:30 (Asia/Jakarta)".
 */
export function formatInTimezone(date: Date, tz: string): string {
    const fmt = new Intl.DateTimeFormat('en-GB', {
        timeZone: tz,
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: false,
    });
    return `${fmt.format(date)} (${tz})`;
}

/** "in 1h 4m" / "in 12s" / "overdue 30s" — short relative descriptor. */
export function relativeFrom(now: Date, target: Date): string {
    const diffMs = target.getTime() - now.getTime();
    const overdue = diffMs < 0;
    let s = Math.floor(Math.abs(diffMs) / 1000);
    const d = Math.floor(s / 86400); s -= d * 86400;
    const h = Math.floor(s / 3600);  s -= h * 3600;
    const m = Math.floor(s / 60);    s -= m * 60;
    const parts: string[] = [];
    if (d) parts.push(`${d}d`);
    if (h) parts.push(`${h}h`);
    if (m) parts.push(`${m}m`);
    if (!d && !h && !m) parts.push(`${s}s`);
    return overdue ? `overdue ${parts.join(' ')}` : `in ${parts.join(' ')}`;
}

/* ─────────────────────── Tool: set_reminder ─────────────────────── */

export interface SetReminderArgs {
    content?: string;
    whenISO?: string;       // ISO 8601 with offset — preferred for absolute times
    relativeMinutes?: number; // alternative: minutes from now
}
export interface SetReminderResult {
    ok: boolean;
    error?:
        | 'missing_content'
        | 'missing_when'
        | 'invalid_iso'
        | 'past_time'
        | 'too_far_future'
        | 'quota_exceeded'
        | 'db_error';
    reminderId?: string;
    scheduledForUTC?: string;
    scheduledForUserLocal?: string;
    userTimezone?: string;
    relative?: string;
}

export async function setReminderForTool(
    message: OmitPartialGroupDMChannel<DiscordMessage<boolean>>,
    args: SetReminderArgs,
): Promise<SetReminderResult> {
    const userId = message.author.id;
    const channelId = message.channel.id;
    const guildId = message.guild?.id ?? null;

    const content = (args?.content || '').trim();
    if (!content) return { ok: false, error: 'missing_content' };
    const truncated = content.length > MAX_CONTENT_CHARS ? content.slice(0, MAX_CONTENT_CHARS) : content;

    let dueAt: Date;
    if (typeof args?.whenISO === 'string' && args.whenISO.trim().length > 0) {
        const t = new Date(args.whenISO);
        if (isNaN(t.getTime())) return { ok: false, error: 'invalid_iso' };
        dueAt = t;
    } else if (typeof args?.relativeMinutes === 'number' && Number.isFinite(args.relativeMinutes)) {
        dueAt = new Date(Date.now() + Math.round(args.relativeMinutes * 60_000));
    } else {
        return { ok: false, error: 'missing_when' };
    }

    const now = Date.now();
    const leadMs = dueAt.getTime() - now;
    if (leadMs < MIN_LEAD_SECONDS * 1000) return { ok: false, error: 'past_time' };
    if (leadMs > MAX_LEAD_MS) return { ok: false, error: 'too_far_future' };

    // Quota check
    try {
        const active = await ReminderModel.countDocuments({ userId, delivered: false });
        if (active >= MAX_ACTIVE_PER_USER) return { ok: false, error: 'quota_exceeded' };
    } catch (error) {
        console.error('[Reminder] quota check failed:', error);
        return { ok: false, error: 'db_error' };
    }

    let doc: any;
    try {
        doc = await ReminderModel.create({
            userId, channelId, guildId,
            content: truncated,
            dueAt,
            delivered: false,
        });
    } catch (error) {
        console.error('[Reminder] insert failed:', error);
        return { ok: false, error: 'db_error' };
    }

    const tz = await loadUserTimezone(userId);
    const result: SetReminderResult = {
        ok: true,
        reminderId: String(doc._id),
        scheduledForUTC: dueAt.toISOString(),
        scheduledForUserLocal: formatInTimezone(dueAt, tz),
        userTimezone: tz,
        relative: relativeFrom(new Date(now), dueAt),
    };
    console.log(`⏰ [Reminder] set for ${userId} → ${result.scheduledForUserLocal} (${result.relative}): "${truncated.slice(0, 60)}"`);
    return result;
}

/* ─────────────────────── Tool: list_reminders ─────────────────────── */

export interface ListReminderItem {
    reminderId: string;
    content: string;
    dueAtUTC: string;
    dueAtUserLocal: string;
    relative: string;
}
export interface ListRemindersResult {
    ok: boolean;
    error?: 'db_error';
    reminders?: ListReminderItem[];
    userTimezone?: string;
}

export async function listRemindersForTool(
    message: OmitPartialGroupDMChannel<DiscordMessage<boolean>>,
): Promise<ListRemindersResult> {
    const userId = message.author.id;
    let docs: any[];
    try {
        docs = await ReminderModel.find({ userId, delivered: false })
            .sort({ dueAt: 1 })
            .limit(50)
            .lean();
    } catch (error) {
        console.error('[Reminder] list failed:', error);
        return { ok: false, error: 'db_error' };
    }
    const tz = await loadUserTimezone(userId);
    const now = new Date();
    return {
        ok: true,
        userTimezone: tz,
        reminders: docs.map((d) => ({
            reminderId: String(d._id),
            content: d.content,
            dueAtUTC: new Date(d.dueAt).toISOString(),
            dueAtUserLocal: formatInTimezone(new Date(d.dueAt), tz),
            relative: relativeFrom(now, new Date(d.dueAt)),
        })),
    };
}

/* ─────────────────────── Tool: cancel_reminder ─────────────────────── */

export interface CancelReminderArgs {
    reminderId?: string;
}
export interface CancelReminderResult {
    ok: boolean;
    error?: 'missing_id' | 'invalid_id' | 'not_found' | 'not_yours' | 'already_delivered' | 'db_error';
}

export async function cancelReminderForTool(
    message: OmitPartialGroupDMChannel<DiscordMessage<boolean>>,
    args: CancelReminderArgs,
): Promise<CancelReminderResult> {
    const userId = message.author.id;
    const id = (args?.reminderId || '').trim();
    if (!id) return { ok: false, error: 'missing_id' };
    // Mongo ObjectId is 24 hex chars.
    if (!/^[a-f0-9]{24}$/i.test(id)) return { ok: false, error: 'invalid_id' };

    let doc: any;
    try {
        doc = await ReminderModel.findById(id).lean();
    } catch (error) {
        console.error('[Reminder] cancel lookup failed:', error);
        return { ok: false, error: 'db_error' };
    }
    if (!doc) return { ok: false, error: 'not_found' };
    if (doc.userId !== userId) return { ok: false, error: 'not_yours' };
    if (doc.delivered) return { ok: false, error: 'already_delivered' };

    try {
        await ReminderModel.deleteOne({ _id: id });
    } catch (error) {
        console.error('[Reminder] cancel delete failed:', error);
        return { ok: false, error: 'db_error' };
    }
    console.log(`🗑️  [Reminder] cancelled ${id} for ${userId}`);
    return { ok: true };
}

/* ─────────────────────── Tool: get_current_time ─────────────────────── */

export interface CurrentTimeResult {
    ok: true;
    serverUTC: string;
    userTimezone: string;
    userLocal: string;
    weekday: string;
}

export async function getCurrentTimeForTool(
    message: OmitPartialGroupDMChannel<DiscordMessage<boolean>>,
): Promise<CurrentTimeResult> {
    const tz = await loadUserTimezone(message.author.id);
    const now = new Date();
    const weekday = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long' }).format(now);
    return {
        ok: true,
        serverUTC: now.toISOString(),
        userTimezone: tz,
        userLocal: formatInTimezone(now, tz),
        weekday,
    };
}

/* ─────────────────────── Tool: set_user_timezone ─────────────────────── */

export interface SetTimezoneArgs {
    timezone?: string;
}
export interface SetTimezoneResult {
    ok: boolean;
    error?: 'missing_timezone' | 'invalid_timezone' | 'db_error';
    timezone?: string;
    userLocal?: string;
}

export async function setUserTimezoneForTool(
    message: OmitPartialGroupDMChannel<DiscordMessage<boolean>>,
    args: SetTimezoneArgs,
): Promise<SetTimezoneResult> {
    const tz = (args?.timezone || '').trim();
    if (!tz) return { ok: false, error: 'missing_timezone' };
    if (!isValidIanaTimezone(tz)) return { ok: false, error: 'invalid_timezone' };

    try {
        await UserProfileModel.updateOne(
            { userId: message.author.id },
            {
                $set: { timezone: tz },
                $setOnInsert: {
                    userId: message.author.id,
                    username: message.author.username,
                    displayName: message.member?.displayName || message.author.username,
                    createdAt: new Date(),
                },
            },
            { upsert: true },
        );
    } catch (error) {
        console.error('[Reminder] set timezone failed:', error);
        return { ok: false, error: 'db_error' };
    }
    console.log(`🌐 [Reminder] timezone for ${message.author.id} set to ${tz}`);
    return { ok: true, timezone: tz, userLocal: formatInTimezone(new Date(), tz) };
}

/* ─────────────────────── Delivery (cron-driven) ─────────────────────── */

/**
 * Scan for due reminders and send each one as `🔔 <@userId> <content>` into
 * the originating channel. Marks delivered regardless of send outcome — a
 * dead channel must not block the queue forever. Per-row errors are logged
 * but don't fail the whole batch.
 */
export async function deliverDueReminders(client: MyClient): Promise<number> {
    const now = new Date();
    let due: any[];
    try {
        due = await ReminderModel.find({ delivered: false, dueAt: { $lte: now } })
            .sort({ dueAt: 1 })
            .limit(100)
            .lean();
    } catch (error) {
        console.error('[Reminder] delivery scan failed:', error);
        return 0;
    }
    if (due.length === 0) return 0;

    let sent = 0;
    for (const r of due) {
        const id = String(r._id);
        let deliveryError: string | undefined;
        try {
            const channel: any = await client.channels.fetch(r.channelId).catch(() => null);
            if (!channel || typeof channel.send !== 'function') {
                deliveryError = 'channel_unavailable';
            } else {
                const safeBody = String(r.content).slice(0, 1800);
                await channel.send({ content: `🔔 <@${r.userId}> ${safeBody}` });
                sent++;
            }
        } catch (error: any) {
            deliveryError = error?.message || 'send_failed';
            console.error(`[Reminder] send failed for ${id}:`, error);
        }
        try {
            await ReminderModel.updateOne(
                { _id: r._id },
                {
                    $set: {
                        delivered: true,
                        deliveredAt: new Date(),
                        ...(deliveryError ? { deliveryError } : {}),
                    },
                },
            );
        } catch (error) {
            console.error(`[Reminder] mark-delivered failed for ${id}:`, error);
        }
    }
    if (sent > 0 || due.length > 0) {
        console.log(`🔔 [Reminder] delivered ${sent}/${due.length} due reminders`);
    }
    return sent;
}
