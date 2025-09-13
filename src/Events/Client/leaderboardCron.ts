import { TextChannel, Message } from "discord.js";
import { Event } from "../../Handlers/eventHandler";
import { MyClient } from "../../Model/client";
import cron from "node-cron";
import { LeaderboardTrackingModel } from "../../Database/connect";
import FairScoringSystem from "../../Functions/scoringSystem";
import { createLeaderboardEmbed } from "../../Commands/Public/Solve/utils";
import crypto from 'crypto';

export const event: Event = {
    name: "clientReady",
    once: true,
    async execute(client: MyClient) {
        console.log("Loading leaderboard auto-update cron jobs...");
        
        // Function to update all active leaderboard embeds
        async function updateLeaderboards() {
            try {
                const activeLeaderboards = await LeaderboardTrackingModel.find({
                    isActive: true
                });

                console.log(`Found ${activeLeaderboards.length} active leaderboard(s) to check for updates`);

                for (const leaderboardTrack of activeLeaderboards) {
                    try {
                        // Get the channel and message
                        const channel = client.channels.cache.get(leaderboardTrack.channelId) as TextChannel;
                        if (!channel) {
                            console.log(`Channel ${leaderboardTrack.channelId} not found, deactivating leaderboard tracker`);
                            leaderboardTrack.isActive = false;
                            await leaderboardTrack.save();
                            continue;
                        }

                        let message: Message;
                        try {
                            message = await channel.messages.fetch(leaderboardTrack.messageId);
                        } catch (error) {
                            console.log(`Message ${leaderboardTrack.messageId} not found (deleted), deactivating leaderboard tracker`);
                            leaderboardTrack.isActive = false;
                            await leaderboardTrack.save();
                            continue;
                        }

                        // Build query for leaderboard data
                        let query: any = {};
                        if (!leaderboardTrack.isGlobal && leaderboardTrack.ctfId) {
                            query.ctf_id = leaderboardTrack.ctfId;
                        }

                        // Get fresh leaderboard data
                        const leaderboard = await FairScoringSystem.getLeaderboard(query, leaderboardTrack.limit);
                        
                        // Generate hash for change detection
                        const newLeaderboardHash = crypto.createHash('md5')
                            .update(JSON.stringify(leaderboard.map(entry => ({
                                userId: entry.userId,
                                totalScore: entry.totalScore,
                                solveCount: entry.solveCount
                            }))))
                            .digest('hex');

                        // Check if there are changes
                        if (newLeaderboardHash === leaderboardTrack.lastHash) {
                            console.log(`No changes in leaderboard ${leaderboardTrack.messageId}, skipping update`);
                            continue;
                        }

                        console.log(`Changes detected in leaderboard ${leaderboardTrack.messageId}, updating...`);

                        // Create updated embed using the shared utility function
                        const updatedEmbed = createLeaderboardEmbed(leaderboard, leaderboardTrack.isGlobal, leaderboardTrack.limit, true);
                        
                        // Update the message
                        await message.edit({ embeds: [updatedEmbed] });
                        
                        // Update tracking data
                        leaderboardTrack.lastHash = newLeaderboardHash;
                        leaderboardTrack.lastUpdated = new Date();
                        leaderboardTrack.updatedAt = new Date();
                        await leaderboardTrack.save();

                        console.log(`✅ Updated leaderboard ${leaderboardTrack.messageId}`);
                        
                    } catch (error) {
                        console.error(`Error updating leaderboard ${leaderboardTrack.messageId}:`, error);
                    }
                }
                
            } catch (error) {
                console.error("Error in leaderboard update cron job:", error);
            }
        }

        // Run every hour
        cron.schedule("0 * * * *", async () => {
            console.log("Running hourly leaderboard updates...");
            await updateLeaderboards();
        }, {
            scheduled: true,
            timezone: "Asia/Singapore"
        });

        // Also run once at startup (delayed)
        setTimeout(async () => {
            console.log("Running initial leaderboard update check...");
            await updateLeaderboards();
        }, 10000); // Wait 10 seconds after startup
    },
};
