import { TextChannel } from "discord.js";
import { Event } from "../../Handlers/eventHandler";
import { MyClient } from "../../Model/client";
import cron from "node-cron";
import { FetchCommandModel, WeightRetryModel, ChallengeModel, CTFCacheModel } from "../../Database/connect";
import { parseChallenges, updateThreadsStatus } from "../../Commands/Public/Solve/utils";
import { infoEvent } from "../../Functions/ctftime-v2";
import { checkUrlSafe } from "../../utils/urlGuard";

let fetchCronInitialized = false;

const FETCH_CONCURRENCY = 5;
const WEIGHT_CONCURRENCY = 5;

async function runWithConcurrency<T>(items: T[], limit: number, task: (item: T) => Promise<void>): Promise<void> {
    if (items.length === 0) return;
    const queue = [...items];
    const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
        while (queue.length) {
            const item = queue.shift();
            if (item === undefined) break;
            await task(item);
        }
    });
    await Promise.all(workers);
}

export const event: Event = {
    name: "ready",
    once: true,
    async execute(client: MyClient) {
        if (fetchCronInitialized) {
            console.log("Fetch cron already initialized, skipping duplicate registration.");
            return;
        }
        fetchCronInitialized = true;

        console.log("Loading fetch cron jobs...");

        async function executeFetchCommands() {
            const now = new Date();
            try {
                // Fetch all active commands once, then split into still-running vs
                // already-finished CTFs based on the populated cache entry. This
                // avoids running the same query twice.
                const activeFetchCommands = await FetchCommandModel.find({ is_active: true })
                    .populate('ctf');

                const live: typeof activeFetchCommands = [];
                const expiredIds: any[] = [];

                for (const cmd of activeFetchCommands) {
                    const ctf: any = cmd.ctf;
                    if (!ctf || !ctf.finish) {
                        // Orphaned record — deactivate so we don't keep re-loading it
                        expiredIds.push(cmd._id);
                        continue;
                    }
                    if (new Date(ctf.finish) <= now) {
                        expiredIds.push(cmd._id);
                        continue;
                    }
                    live.push(cmd);
                }

                if (expiredIds.length > 0) {
                    await FetchCommandModel.updateMany(
                        { _id: { $in: expiredIds } },
                        { $set: { is_active: false } }
                    );
                }

                await runWithConcurrency(live, FETCH_CONCURRENCY, async (fetchCmd: any) => {
                    try {
                        const channel = client.channels.cache.get(fetchCmd.channel_id) as TextChannel | undefined;
                        if (!channel) {
                            console.log(`Channel ${fetchCmd.channel_id} not found for fetch command`);
                            return;
                        }

                        // SSRF guard on every recurring fetch too — a saved command
                        // could target an internal host (2026-06-09 audit fix).
                        const urlGuard = await checkUrlSafe(fetchCmd.url);
                        if (!urlGuard.ok) {
                            console.log(`[fetchCron] rejected unsafe URL ${fetchCmd.url}: ${urlGuard.error}`);
                            return;
                        }

                        const response = await fetch(fetchCmd.url, {
                            method: fetchCmd.method,
                            headers: fetchCmd.headers as any,
                            body: fetchCmd.body || undefined
                        });

                        if (!response.ok) {
                            console.log(`Fetch command failed for ${fetchCmd.url}: ${response.status} ${response.statusText}`);
                            return;
                        }

                        const jsonData = await response.text();

                        await updateChallengesFromFetch(jsonData, fetchCmd, channel);

                        await FetchCommandModel.updateOne(
                            { _id: fetchCmd._id },
                            { $set: { last_executed: new Date() } }
                        );
                    } catch (error) {
                        console.error(`Error executing fetch command for ${fetchCmd.url}:`, error);
                    }
                });
            } catch (error) {
                console.error("Error in fetch cron job:", error);
            }
        }

        // Run every 5 minutes
        cron.schedule("*/5 * * * *", async () => {
            await executeFetchCommands();
        }, {
            scheduled: true,
            timezone: "Asia/Singapore"
        });

        // Daily weight retry job - runs at 2 AM daily
        cron.schedule("0 2 * * *", async () => {
            await retryWeightFetch();
        }, {
            scheduled: true,
            timezone: "Asia/Singapore"
        });

        // Also run once at startup
        setTimeout(async () => {
            await executeFetchCommands();
            await retryWeightFetch();
        }, 5000);
    },
};

async function updateChallengesFromFetch(jsonData: string, fetchCmd: any, channel: TextChannel) {
    try {
        const challenges = await parseChallenges(jsonData);

        if (challenges.length === 0) {
            console.log("No challenges found in fetch result");
            return;
        }

        await saveChallengesFromFetch(challenges, fetchCmd.ctf.ctf_id);
        await updateThreadsStatus(challenges, channel, fetchCmd.ctf.ctf_id);

        console.log(`Updated ${challenges.length} challenges for CTF ${fetchCmd.ctf.ctf_id}`);
    } catch (error) {
        console.error("Error updating challenges from fetch:", error);
    }
}

/**
 * Replace per-challenge findOne+save with a single bulkWrite. Mongo handles
 * the existence check + update/insert in one round-trip per batch.
 */
async function saveChallengesFromFetch(challenges: any[], ctfId: string) {
    if (challenges.length === 0) return;

    const now = new Date();
    const ops = challenges.map((c) => {
        const setOnUpdate: any = {
            category: c.category,
            points: c.points,
            solves: c.solves,
            is_solved: c.solved,
            tags: c.tags || [],
            updated_at: now,
            'platform_data.id': c.id,
        };
        if (c.description) setOnUpdate.description = c.description;

        return {
            updateOne: {
                filter: { ctf_id: ctfId, name: c.name },
                update: {
                    $set: setOnUpdate,
                    $setOnInsert: {
                        name: c.name,
                        ctf_id: ctfId,
                        created_at: now,
                    },
                },
                upsert: true,
            },
        };
    });

    try {
        await ChallengeModel.bulkWrite(ops, { ordered: false });
    } catch (error) {
        console.error('Error bulk-saving challenges:', error);
    }
}

/**
 * Periodically refresh weights for monitored CTFs. Now parallel-bounded
 * and uses bulkWrite to update retry bookkeeping in one round-trip.
 */
async function retryWeightFetch() {
    try {
        const now = new Date();
        const activeRetries = await WeightRetryModel.find({
            is_active: true,
            retry_until: { $gt: now }
        });

        console.log(`Found ${activeRetries.length} CTFs being monitored for vote changes`);

        const updates: any[] = [];

        await runWithConcurrency(activeRetries, WEIGHT_CONCURRENCY, async (retry: any) => {
            try {
                const ctfEvent = await infoEvent(retry.ctf_id, false);
                const previousWeight = retry.current_weight || 0;
                const currentWeight = ctfEvent.weight;

                if (currentWeight !== previousWeight) {
                    console.log(`📊 Weight changed for CTF ${retry.ctf_title}: ${previousWeight} → ${currentWeight}`);
                }

                updates.push({
                    updateOne: {
                        filter: { _id: retry._id },
                        update: {
                            $set: { current_weight: currentWeight, last_retry: new Date() },
                            $inc: { retry_count: 1 },
                        },
                    },
                });
            } catch (error) {
                console.error(`Error checking vote changes for ${retry.ctf_id}:`, error);
            }
        });

        if (updates.length > 0) {
            await WeightRetryModel.bulkWrite(updates, { ordered: false });
        }

        const expiredCount = await WeightRetryModel.updateMany(
            { retry_until: { $lt: now }, is_active: true },
            { $set: { is_active: false } }
        );

        if (expiredCount.modifiedCount > 0) {
            console.log(`🗑️ Deactivated ${expiredCount.modifiedCount} expired vote monitoring entries`);
        }
    } catch (error) {
        console.error("Error in vote monitoring job:", error);
    }
}
