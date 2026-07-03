import cron from "node-cron";
import {
    ChannelType, TextChannel, Role, Guild, GuildScheduledEvent,
    GuildScheduledEventStatus, OverwriteType,
} from "discord.js";
import { Event } from "../../Handlers/eventHandler";
import { MyClient } from "../../Model/client";
import { translate } from "../../Functions/discord-utils";
import { EventReminderStateModel, IndexedMessageModel } from "../../Database/connect";
import {
    MS, DEFAULT_REMINDER_CONFIG, ReminderConfig,
    decidePublicMilestone, decidePrivateMilestones,
    isChannelOverflowing, shouldActivityRemind, isUpcomingWithinHorizon,
} from "../../Functions/eventReminders";

/**
 * Proactive CTF event-reminder cron. Anchored entirely on the community's
 * registered Discord SCHEDULED EVENTS — the only source with start time +
 * participants (role) + a private channel together.
 *
 * Three public surfaces into the "mabar-ctf" channel(s):
 *   1. countdown milestones (T-24h / T-3h / T-1h) — decidePublicMilestone
 *   2. activity re-surface when the channel is overflowing — shouldActivityRemind
 *   (the T-1h is the "one hour before" the user asked for)
 * Plus a warm role-tagged nudge in each competition's private channel at start.
 *
 * DELIVERY SEMANTICS (at-most-once): every milestone is CLAIMED atomically in
 * Mongo ($addToSet, guarded by $ne) BEFORE the Discord send. A save-race can
 * therefore never re-fire a countdown/role-ping (no duplicate blast); the
 * accepted trade is that a send failure after a won claim drops that one
 * reminder rather than risk a ping storm. We only claim once the target channel
 * actually exists, so a transiently-absent channel just retries next tick within
 * the milestone's grace window.
 *
 * Firing math is pure + unit-tested (Functions/eventReminders.ts); this file is
 * the thin Discord/Mongo shell. Display uses Discord relative timestamps so the
 * math stays plain UTC.
 */

const CFG: ReminderConfig = DEFAULT_REMINDER_CONFIG;
const TICK_CRON = "*/5 * * * *"; // every 5 minutes
// A managed CTF competition has its CTFtime URL in entityMetadata.location (set
// by createEventIfNotExist). Gating on it keeps countdowns off any non-CTF /
// calendar-sync scheduled events, matching eventAutoRebind's discriminator.
const EVENT_ID_REGEX = /\/event\/(\d+)\//;
const isManagedCtfEvent = (e: GuildScheduledEvent): boolean =>
    !!e.entityMetadata?.location && EVENT_ID_REGEX.test(e.entityMetadata.location);
const FINAL_OFFSET_MS = Math.min(...CFG.publicOffsetsMs); // the closest-to-start countdown = "final hour" copy
const relTs = (ms: number) => `<t:${Math.floor(ms / 1000)}:R>`;

// Per-channel anti-spam anchor for the activity re-surface, updated by ANY public
// post (countdown OR activity) to a mabar channel. In-memory on purpose: it guards
// spam, not correctness — a restart at worst allows one extra activity post. (The
// milestone dedup, which MUST survive restarts, is the DB-backed firedKeys.)
const channelPublicPostAt = new Map<string, number>();

// ── copy (warm, in Hackerika's voice; deterministic templates so the scheduler
//    never depends on an LLM round-trip). {t}=relative-time, {title}, {role}. ──
const PUBLIC_COUNTDOWN = [
    "eh btw **{title}** mulai {t} loh 👀 siap-siap yaa",
    "reminder: **{title}** {t} nih 🔥 jangan sampe kelewat",
    "woy **{title}** mulai {t}! udah pada prepare belum 😤",
    "ceki-ceki, **{title}** {t} 👀 gas kumpulin tim",
];
const PUBLIC_FINAL_HOUR = [
    "⏰ **{title}** MULAI {t}! gas semua siap-siap 🔥",
    "bentar lagi cuy — **{title}** {t} 🔥 warm up gih",
    "heh **{title}** {t}! jangan molor 😤 gaskeun",
];
const ACTIVITY_RESURFACE = [
    "rame amat 👀 btw jangan lupa ya, **{title}** mulai {t} 🔥",
    "sekalian ngingetin di tengah rame: **{title}** {t}! prepare 😤",
    "eh mumpung pada online — **{title}** {t}, siap-siap yaa 🔥",
];
const PRIVATE_START = [
    "{role} gaskeun semuaa! **{title}** udah mulai {t} 🔥 semangat yaa, koordinasi di sini, jangan lupa submit flag 🚩",
    "{role} yuk mulai!! **{title}** jalan {t} 🔥 semangat timku, share progress di sini ya, kita bisa 💪",
    "{role} it's time! **{title}** {t} 🚩 fokus, have fun, jangan stress kalo stuck — tanya sini aja. gaass 🔥",
];
const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];
const fill = (tpl: string, v: Record<string, string>) => tpl.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? "");

function findMabarChannels(guild: Guild): TextChannel[] {
    return [...guild.channels.cache.values()].filter(
        (c): c is TextChannel => c.type === ChannelType.GuildText && c.name.toLowerCase().includes("mabar-ctf"),
    );
}
function findPrivateChannel(guild: Guild, ev: GuildScheduledEvent): TextChannel | undefined {
    const name = translate(ev.name);
    return [...guild.channels.cache.values()].find(
        (c): c is TextChannel => c.type === ChannelType.GuildText && c.name === name,
    );
}
function findEventRole(channel: TextChannel): Role | undefined {
    for (const [id, ow] of channel.permissionOverwrites.cache) {
        if (ow.type === OverwriteType.Role && id !== channel.guild.id && ow.allow.has("ViewChannel")) {
            const role = channel.guild.roles.cache.get(id);
            if (role) return role;
        }
    }
    return undefined;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Send to each channel; return how many actually delivered (0 ⇒ nothing landed).
 * One retry per channel: discord.js already auto-retries rate-limits (429), so a
 * retry here just covers a transient 5xx/network blip before we accept the drop
 * (the claim already succeeded, so a permanent failure drops rather than storms).
 */
async function sendTo(channels: TextChannel[], content: string, allowedMentions?: any): Promise<number> {
    const opts = { content, ...(allowedMentions ? { allowedMentions } : {}) };
    let ok = 0;
    for (const ch of channels) {
        let delivered = await ch.send(opts).then(() => true).catch(() => false);
        if (!delivered) { await sleep(1500); delivered = await ch.send(opts).then(() => true).catch(() => false); }
        if (delivered) ok++;
        else console.error(`[EventReminder] send failed (after retry) in #${ch.name}`);
    }
    return ok;
}

/** Ensure the per-event state doc exists (atomic upsert — no findOne-then-create race). */
async function ensureState(ev: GuildScheduledEvent, guildId: string, startMs: number): Promise<Set<string>> {
    const doc = await EventReminderStateModel.findOneAndUpdate(
        { discordEventId: ev.id },
        {
            $setOnInsert: { discordEventId: ev.id, guildId, firedKeys: [] },
            $set: { title: ev.name, eventStart: new Date(startMs), updatedAt: new Date() },
        },
        { upsert: true, new: true },
    ).lean();
    return new Set<string>(((doc as any)?.firedKeys as string[]) || []);
}

/**
 * Atomically claim a milestone key BEFORE sending. Returns true only if THIS call
 * added the key (i.e. it wasn't already fired) — the $ne guard makes it a
 * compare-and-set, so a concurrent tick/shard can never both win. Marks the
 * event's last-public time too when requested.
 */
async function claimKey(discordEventId: string, key: string, touchPublic = false): Promise<boolean> {
    try {
        const res = await EventReminderStateModel.findOneAndUpdate(
            { discordEventId, firedKeys: { $ne: key } },
            { $addToSet: { firedKeys: key }, $set: { updatedAt: new Date(), ...(touchPublic ? { lastPublicReminderAt: new Date() } : {}) } },
        );
        return res !== null;
    } catch (error) {
        console.error(`[EventReminder] claim failed for ${key}:`, error);
        return false; // don't send if we couldn't record the claim (avoids duplicate on retry)
    }
}

/** Mark keys fired WITHOUT sending (anti-burst collapse of older crossed milestones). */
async function markFired(discordEventId: string, keys: string[]): Promise<void> {
    if (!keys.length) return;
    try {
        await EventReminderStateModel.updateOne(
            { discordEventId },
            { $addToSet: { firedKeys: { $each: keys } }, $set: { updatedAt: new Date() } },
        );
    } catch (error) { console.error("[EventReminder] markFired failed:", error); }
}

async function recentMessageCount(channelId: string, now: number): Promise<number> {
    try {
        return await IndexedMessageModel
            .countDocuments({ channelId, createdAt: { $gte: new Date(now - CFG.overflowWindowMs) } })
            .maxTimeMS(10_000);
    } catch (error) {
        console.error("[EventReminder] overflow count failed:", error);
        return 0;
    }
}

interface Nearest { startMs: number; name: string; url: string; }

async function processEvent(guild: Guild, ev: GuildScheduledEvent, mabarChannels: TextChannel[], now: number): Promise<Nearest | null> {
    const startMs = ev.scheduledStartTimestamp;
    if (!startMs) return null;
    const endMs = ev.scheduledEndTimestamp ?? startMs + 24 * MS.hour;

    const fired = await ensureState(ev, guild.id, startMs);

    // 1) PUBLIC countdown (T-24h/T-3h/T-1h) — most-recently-crossed only (anti-burst).
    const pub = decidePublicMilestone(now, startMs, fired, CFG);
    if (pub.skipKeys.length) await markFired(ev.id, pub.skipKeys);
    if (pub.fireKey && mabarChannels.length) {
        // Claim BEFORE send; only a winning claim posts. (Absent channel ⇒ don't
        // claim ⇒ retry next tick.)
        if (await claimKey(ev.id, pub.fireKey, true)) {
            const isFinal = pub.fireOffsetMs === FINAL_OFFSET_MS;
            const body = fill(pick(isFinal ? PUBLIC_FINAL_HOUR : PUBLIC_COUNTDOWN), { title: ev.name, t: relTs(startMs) });
            // Re-share the Discord event so members can jump to it + click Interested
            // (the bare URL on its own line renders the event card).
            const n = await sendTo(mabarChannels, `${body}\n${ev.url}`);
            if (n > 0) { mabarChannels.forEach((c) => channelPublicPostAt.set(c.id, now)); console.log(`🔔 [EventReminder] public ${pub.fireKey} for "${ev.name}" (${guild.name})`); }
            else console.warn(`[EventReminder] claimed ${pub.fireKey} but 0 delivered — dropped: "${ev.name}"`);
        }
    }

    // 2) PRIVATE nudge (at start) — role-tagged warm support; retry-if-absent within grace.
    for (const key of decidePrivateMilestones(now, startMs, endMs, fired, CFG)) {
        const channel = findPrivateChannel(guild, ev);
        if (!channel) continue; // transiently absent → retry next tick within the grace window
        if (!(await claimKey(ev.id, key))) continue;
        const role = findEventRole(channel);
        const roleTag = role ? `<@&${role.id}>` : "semuaa";
        const n = await sendTo([channel], fill(pick(PRIVATE_START), { title: ev.name, t: relTs(startMs), role: roleTag }), role ? { roles: [role.id] } : undefined);
        if (n > 0) console.log(`🚩 [EventReminder] private start nudge for "${ev.name}" (${guild.name})`);
        else console.warn(`[EventReminder] claimed private nudge but 0 delivered — dropped: "${ev.name}"`);
    }

    return isUpcomingWithinHorizon(now, startMs, CFG) ? { startMs, name: ev.name, url: ev.url } : null;
}

async function tick(client: MyClient) {
    const now = Date.now();
    for (const guild of client.guilds.cache.values()) {
        try {
            const scheduled = await guild.scheduledEvents.fetch().catch(() => null);
            if (!scheduled || scheduled.size === 0) continue;
            const events = [...scheduled.values()].filter(
                (e) => (e.status === GuildScheduledEventStatus.Scheduled || e.status === GuildScheduledEventStatus.Active)
                    && isManagedCtfEvent(e),
            );
            if (!events.length) continue;

            const mabarChannels = findMabarChannels(guild);

            let nearest: Nearest | null = null;
            for (const ev of events) {
                const res = await processEvent(guild, ev, mabarChannels, now);
                if (res && (!nearest || res.startMs < nearest.startMs)) nearest = res;
            }

            // 3) ACTIVITY re-surface: mabar-ctf overflowing (uncapped IndexedMessage count)
            //    + an event within horizon + per-channel cooldown ok.
            if (nearest && mabarChannels.length) {
                for (const ch of mabarChannels) {
                    if (!isChannelOverflowing(await recentMessageCount(ch.id, now), CFG)) continue;
                    const lastAt = channelPublicPostAt.get(ch.id) ?? null;
                    if (!shouldActivityRemind(now, lastAt, true, true, CFG)) continue;
                    const n = await sendTo([ch], `${fill(pick(ACTIVITY_RESURFACE), { title: nearest.name, t: relTs(nearest.startMs) })}\n${nearest.url}`);
                    if (n > 0) { channelPublicPostAt.set(ch.id, now); console.log(`📣 [EventReminder] activity re-surface for "${nearest.name}" (#${ch.name})`); }
                }
            }
        } catch (error) {
            console.error(`[EventReminder] guild tick failed (${guild.id}):`, error);
        }
    }
}

let cronInit = false;
let ticking = false;   // re-entrancy guard: node-cron does not prevent an overlapping tick
export const event: Event = {
    name: "ready",
    once: true,
    async execute(client: MyClient) {
        if (cronInit) return;   // guard against a second `ready` (reconnect) double-scheduling
        cronInit = true;
        cron.schedule(TICK_CRON, async () => {
            if (ticking) { console.warn("[EventReminder] previous tick still running — skipping"); return; }
            ticking = true;
            try { await tick(client); }
            catch (error) { console.error("[EventReminder] tick failed:", error); }
            finally { ticking = false; }
        });
        console.log("✅ Event-reminder cron loaded (countdown + activity + private nudge)");
    },
};
