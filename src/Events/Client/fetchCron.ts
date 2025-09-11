import { BaseGuildTextChannel, TextChannel } from "discord.js";
import { Event } from "../../Handlers/eventHandler";
import { MyClient } from "../../Model/client";
import cron from "node-cron";
import { FetchCommandModel, WeightRetryModel } from "../../Database/connect";
import { parseChallenges, updateThreadStatus } from "../../Commands/Public/Solve/utils/parser";
import { infoEvent } from "../../Functions/ctftime-v2";

export const event: Event = {
    name: "clientReady",
    once: true,
    async execute(client: MyClient) {
        console.log("Loading fetch cron jobs...");
        
        // Function to execute fetch commands and update challenges
        async function executeFetchCommands() {
            try {
                const activeFetchCommands = await FetchCommandModel.find({
                    is_active: true,
                    ctf_end_time: { $gt: new Date() }
                });

                for (const fetchCmd of activeFetchCommands) {
                    try {
                        // Find the channel
                        const channel = client.channels.cache.get(fetchCmd.channel_id) as TextChannel;
                        if (!channel) {
                            console.log(`Channel ${fetchCmd.channel_id} not found for fetch command`);
                            continue;
                        }

                        // Execute fetch command
                        const response = await fetch(fetchCmd.url, {
                            method: fetchCmd.method,
                            headers: fetchCmd.headers as any,
                            body: fetchCmd.body || undefined
                        });

                        if (!response.ok) {
                            console.log(`Fetch command failed for ${fetchCmd.url}: ${response.status} ${response.statusText}`);
                            continue;
                        }

                        const jsonData = await response.text();
                        
                        // Update challenges using the same logic from init command
                        await updateChallengesFromFetch(jsonData, fetchCmd, channel);
                        
                        // Update last executed time
                        fetchCmd.last_executed = new Date();
                        await fetchCmd.save();
                        
                    } catch (error) {
                        console.error(`Error executing fetch command for ${fetchCmd.url}:`, error);
                    }
                }

                // Clean up expired fetch commands
                await FetchCommandModel.updateMany(
                    { ctf_end_time: { $lt: new Date() }, is_active: true },
                    { $set: { is_active: false } }
                );
                
            } catch (error) {
                console.error("Error in fetch cron job:", error);
            }
        }

        // Run every 5 minutes
        cron.schedule("*/5 * * * *", async () => {
            console.log("Executing fetch commands...");
            await executeFetchCommands();
        }, {
            scheduled: true,
            timezone: "Asia/Singapore"
        });

        // Daily weight retry job - runs at 2 AM daily
        cron.schedule("0 2 * * *", async () => {
            console.log("Running daily weight retry job...");
            await retryWeightFetch();
        }, {
            scheduled: true,
            timezone: "Asia/Singapore"
        });

        // Also run once at startup
        setTimeout(async () => {
            await executeFetchCommands();
            await retryWeightFetch(); // Also run weight retry on startup
        }, 5000); // Wait 5 seconds after startup
    },
};

// Function to update challenges from fetch result
async function updateChallengesFromFetch(jsonData: string, fetchCmd: any, channel: TextChannel) {
    try {
        const challenges = await parseChallenges(jsonData, fetchCmd.platform);
        
        if (challenges.length === 0) {
            console.log("No challenges found in fetch result");
            return;
        }

        // Update thread status for each challenge
        await updateThreadStatus(challenges, channel, fetchCmd.ctf_id);
        
        console.log(`Updated ${challenges.length} challenges for CTF ${fetchCmd.ctf_id}`);
        
    } catch (error) {
        console.error("Error updating challenges from fetch:", error);
    }
}

// Function to retry fetching weights for CTFs with weight = 0
async function retryWeightFetch() {
    try {
        // Get active weight retry entries
        const activeRetries = await WeightRetryModel.find({
            is_active: true,
            retry_until: { $gt: new Date() } // Still within retry period
        });

        console.log(`Found ${activeRetries.length} CTFs pending weight retry`);

        for (const retry of activeRetries) {
            try {
                console.log(`🔄 Retrying weight fetch for CTF: ${retry.ctf_title} (${retry.ctf_id})`);
                
                // Fetch fresh data (no cache)
                const ctfEvent = await infoEvent(retry.ctf_id, false);
                
                if (ctfEvent.weight > 0) {
                    // Weight has been assigned!
                    console.log(`✅ Weight assigned for CTF ${retry.ctf_title}: ${ctfEvent.weight}`);
                    
                    // Deactivate retry
                    retry.is_active = false;
                    await retry.save();
                } else {
                    // Still weight 0, update retry info
                    retry.last_retry = new Date();
                    retry.retry_count += 1;
                    await retry.save();
                    
                    console.log(`⏳ CTF ${retry.ctf_title} still has weight 0 (retry #${retry.retry_count})`);
                }
                
            } catch (error) {
                console.error(`Error retrying weight fetch for ${retry.ctf_id}:`, error);
            }
        }

        // Clean up expired retries (past one week after CTF end)
        const expiredCount = await WeightRetryModel.updateMany(
            { 
                retry_until: { $lt: new Date() },
                is_active: true 
            },
            { 
                $set: { is_active: false } 
            }
        );

        if (expiredCount.modifiedCount > 0) {
            console.log(`🗑️ Deactivated ${expiredCount.modifiedCount} expired weight retry entries`);
        }

    } catch (error) {
        console.error("Error in weight retry job:", error);
    }
}
