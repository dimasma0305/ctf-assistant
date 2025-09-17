import { BaseGuildTextChannel, TextChannel } from "discord.js";
import { Event } from "../../Handlers/eventHandler";
import { MyClient } from "../../Model/client";
import cron from "node-cron";
import { FetchCommandModel, WeightRetryModel, ChallengeModel } from "../../Database/connect";
import { parseChallenges, updateThreadStatus } from "../../Commands/Public/Solve/utils";
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
                    is_active: true
                }).populate({
                    path: 'ctf',
                    match: { finish: { $gt: new Date() } }
                });

                for (const fetchCmd of activeFetchCommands) {
                    // Skip if CTF has finished (populate match will make ctf null if finished)
                    if (!fetchCmd.ctf) {
                        continue;
                    }

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

                // Clean up expired fetch commands by finding those with finished CTFs
                const expiredCommands = await FetchCommandModel.find({
                    is_active: true
                }).populate({
                    path: 'ctf',
                    match: { finish: { $lt: new Date() } }
                });

                const expiredCommandIds = expiredCommands
                    .filter(cmd => cmd.ctf) // Only commands where CTF is populated (meaning it matches the finished condition)
                    .map(cmd => cmd._id);

                if (expiredCommandIds.length > 0) {
                    await FetchCommandModel.updateMany(
                        { _id: { $in: expiredCommandIds } },
                        { $set: { is_active: false } }
                    );
                }
                
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
            await retryWeightFetch(); // Also run weight retry on startup
        }, 5000); // Wait 5 seconds after startup
    },
};

// Function to update challenges from fetch result
async function updateChallengesFromFetch(jsonData: string, fetchCmd: any, channel: TextChannel) {
    try {
        const challenges = await parseChallenges(jsonData);
        
        if (challenges.length === 0) {
            console.log("No challenges found in fetch result");
            return;
        }

        // Save/update challenges in database
        await saveChallengesFromFetch(challenges, fetchCmd.ctf.ctf_id);

        // Update thread status for each challenge
        await updateThreadStatus(challenges, channel, fetchCmd.ctf.ctf_id);
        
        console.log(`Updated ${challenges.length} challenges for CTF ${fetchCmd.ctf.ctf_id}`);
        
    } catch (error) {
        console.error("Error updating challenges from fetch:", error);
    }
}

// Helper function to save/update challenges from fetch data
async function saveChallengesFromFetch(challenges: any[], ctfId: string) {
    for (const challengeData of challenges) {
        try {
            // Find existing challenge or create new one
            let challenge = await ChallengeModel.findOne({
                ctf_id: ctfId,
                name: challengeData.name
            });

            if (challenge) {
                // Update existing challenge
                challenge.category = challengeData.category;
                challenge.points = challengeData.points;
                challenge.solves = challengeData.solves;
                challenge.is_solved = challengeData.solved;
                challenge.tags = challengeData.tags || [];
                challenge.updated_at = new Date();
                
                if (challengeData.description) {
                    challenge.description = challengeData.description;
                }
                
                // Store platform-specific data
                challenge.platform_data = {
                    id: challengeData.id,
                    ...challenge.platform_data
                };

                await challenge.save();
            } else {
                // Create new challenge
                challenge = new ChallengeModel({
                    challenge_id: `${ctfId}-${challengeData.name.replace(/[^a-zA-Z0-9]/g, '-')}`,
                    name: challengeData.name,
                    category: challengeData.category,
                    points: challengeData.points,
                    description: challengeData.description || "",
                    solves: challengeData.solves,
                    tags: challengeData.tags || [],
                    ctf_id: ctfId,
                    is_solved: challengeData.solved,
                    platform_data: {
                        id: challengeData.id
                    },
                    created_at: new Date(),
                    updated_at: new Date()
                });

                await challenge.save();
            }
        } catch (error) {
            console.error(`Error saving challenge ${challengeData.name}:`, error);
        }
    }
}

// Function to monitor vote changes for all CTFs during the 2-week period
async function retryWeightFetch() {
    try {
        // Get active weight retry entries
        const activeRetries = await WeightRetryModel.find({
            is_active: true,
            retry_until: { $gt: new Date() } // Still within retry period
        });

        console.log(`Found ${activeRetries.length} CTFs being monitored for vote changes`);

        for (const retry of activeRetries) {
            try {
                console.log(`🔄 Checking for vote changes for CTF: ${retry.ctf_title} (${retry.ctf_id})`);
                
                // Fetch fresh data (no cache)
                const ctfEvent = await infoEvent(retry.ctf_id, false);
                
                const previousWeight = (retry as any).current_weight || 0;
                const currentWeight = ctfEvent.weight;
                
                if (currentWeight !== previousWeight) {
                    // Weight has changed!
                    console.log(`📊 Weight changed for CTF ${retry.ctf_title}: ${previousWeight} → ${currentWeight}`);
                    
                    // Update stored weight
                    (retry as any).current_weight = currentWeight;
                } else {
                    console.log(`⏳ CTF ${retry.ctf_title} weight unchanged: ${currentWeight} (retry #${retry.retry_count + 1})`);
                }
                
                // Always update retry info
                retry.last_retry = new Date();
                retry.retry_count += 1;
                await retry.save();
                
            } catch (error) {
                console.error(`Error checking vote changes for ${retry.ctf_id}:`, error);
            }
        }

        // Clean up expired retries (past 2 weeks after CTF end)
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
            console.log(`🗑️ Deactivated ${expiredCount.modifiedCount} expired vote monitoring entries`);
        }

    } catch (error) {
        console.error("Error in vote monitoring job:", error);
    }
}
