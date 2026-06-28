import cron from "node-cron";
import { Event } from "../../Handlers/eventHandler";
import { MyClient } from "../../Model/client";
import { UserProfileModel } from "../../Database/connect";
import {
    selectFollowupCandidates,
    markTaskFollowedUp,
} from "../../Services/AI/tasks";
import { openai } from "../../utils/openai";
import { MODELS } from "../../Services/AI/models";

let cronInit = false;

// Gating constants — bounds proactive outreach so it doesn't feel spammy.
const MIN_AFFECTION = 30;                     // skip users below this affection
const ACTIVE_WINDOW_DAYS = 7;                 // user must have chatted in last N days
const DRAFT_MODEL = MODELS.light;
const DRAFT_TIMEOUT_MS = 20_000;

/**
 * Daily 9 AM Jakarta cron — Hackerika's proactive follow-up loop.
 *
 * For each user with a stalled active task (no activity in 5+ days), check
 * gates (affection ≥ 30, user active in last 7d), draft a short opener via
 * the flash model, and send it to the task's original channel.
 *
 * One follow-up per user per run (≤ once a day). FOLLOWUP_COOLDOWN_DAYS in
 * tasks.ts ensures the same task isn't pinged twice in <24h.
 */
async function runDailyFollowups(client: MyClient): Promise<void> {
    const candidates = await selectFollowupCandidates();
    if (candidates.length === 0) {
        console.log('[TaskCron] no stalled tasks need follow-up');
        return;
    }
    console.log(`[TaskCron] ${candidates.length} candidate(s) for follow-up`);

    const activeCutoff = new Date(Date.now() - ACTIVE_WINDOW_DAYS * 86_400_000);
    let sent = 0;
    let skipped = 0;

    for (const { userId, channelId, task } of candidates) {
        // Gate 1: affection check.
        let affection = 0;
        let displayName = '';
        try {
            const profile = await UserProfileModel.findOne({ userId })
                .select({ affection: 1, displayName: 1, lastInteractionAt: 1, implicitGoals: 1 })
                .lean();
            affection = (profile as any)?.affection ?? 0;
            displayName = (profile as any)?.displayName || '';
            const lastActive = (profile as any)?.lastInteractionAt;
            if (!lastActive || new Date(lastActive) < activeCutoff) {
                skipped++;
                continue;
            }
        } catch (error) {
            console.error('[TaskCron] profile load failed:', error);
            skipped++;
            continue;
        }
        if (affection < MIN_AFFECTION) {
            skipped++;
            continue;
        }

        // Gate 2: channel resolvable.
        let channel: any = null;
        try {
            channel = await client.channels.fetch(channelId).catch(() => null);
        } catch { /* silent */ }
        if (!channel || typeof channel.send !== 'function') {
            skipped++;
            continue;
        }

        // Draft the follow-up via flash model. Brief, casual, mention the task
        // naturally (not "TASK_ID xxx").
        let draft = '';
        try {
            const completion = await openai.chat.completions.create(
                {
                    model: DRAFT_MODEL,
                    messages: [
                        {
                            role: 'system',
                            content:
                                'Kamu Hackerika, cewek Indonesia di Discord. Lo lagi natural reach-out ke user soal task dia yang udah stall. ' +
                                'Tulis SATU pesan singkat (1-2 burst, max 2 kalimat, pake \\n\\n buat split burst). ' +
                                'Tone: casual, warm tapi ga over-the-top. Ga formal. Lowercase. Filler ok ("nih", "btw", "wkwk"). ' +
                                'Reference task SECARA NATURAL — bukan "TASK XYZ udah berapa hari" tapi "btw soal X yg dulu lo bilang mau ningkatin, gimana progress-nya?" ' +
                                'JANGAN sebut kata "task" / "follow-up" / "stalled". JANGAN minta apology. JANGAN list ulang detail. ' +
                                'Output TEXT only, no JSON, no labels.',
                        },
                        {
                            role: 'user',
                            content:
                                `User: ${displayName || userId}\n` +
                                `Task description: ${task.description}\n` +
                                `Last touched: ${task.lastWorkedOn ? new Date(task.lastWorkedOn).toISOString() : 'unknown'}\n` +
                                `Recurrence: ${task.recurrence}\n` +
                                (Array.isArray(task.notes) && task.notes.length > 0
                                    ? `Recent note: ${task.notes[task.notes.length - 1].text}\n`
                                    : '') +
                                `\nTulis pesan natural buat ngecek-in soal task ini.`,
                        },
                    ],
                    temperature: 0.7,
                    n: 1,
                },
                { signal: AbortSignal.timeout(DRAFT_TIMEOUT_MS) },
            );
            draft = (completion.choices[0]?.message?.content || '').trim();
        } catch (error) {
            console.error('[TaskCron] draft failed:', error);
            skipped++;
            continue;
        }

        if (!draft || draft.length < 4) {
            skipped++;
            continue;
        }

        // Strip any accidental speaker tag at the start (same safeguard as chat.ts).
        draft = draft.replace(/^\[[^\]\n]{1,100}<@\d{17,20}>\]\s*/, '').trim();
        if (!draft) {
            skipped++;
            continue;
        }

        // Send. Mention the user once at the start so they get notified — they
        // weren't expecting a message from a cron, so a passive post would be
        // missed.
        const body = `<@${userId}> ${draft.slice(0, 1900)}`;
        try {
            await channel.send({ content: body });
            await markTaskFollowedUp(task._id);
            sent++;
            console.log(`📋 [TaskCron] followed up task ${String(task._id).slice(-6)} → <@${userId}> in #${channel.name || channelId}`);
        } catch (error) {
            console.error('[TaskCron] send failed:', error);
            skipped++;
        }
    }

    console.log(`📋 [TaskCron] daily run: sent=${sent} skipped=${skipped} of ${candidates.length} candidates`);
}

export const event: Event = {
    name: "ready",
    once: true,
    async execute(client: MyClient) {
        if (cronInit) return;
        cronInit = true;

        console.log('📋 Loading task follow-up cron...');

        // Daily at 9 AM Jakarta (UTC+7). Predictable morning timing — won't
        // randomly DM at odd hours.
        cron.schedule('0 9 * * *', async () => {
            try {
                await runDailyFollowups(client);
            } catch (error) {
                console.error('[TaskCron] tick failed:', error);
            }
        }, { scheduled: true, timezone: 'Asia/Jakarta' });

        console.log('✅ Task follow-up cron loaded (daily 9am Jakarta)');
    },
};
