import { TextChannel, EmbedBuilder, Message } from "discord.js";
import { Event } from "../../Handlers/eventHandler";
import { MyClient } from "../../Model/client";
import cron from "node-cron";
import { LeaderboardTrackingModel, solveModel } from "../../Database/connect";
import FairScoringSystem from "../../Functions/scoringSystem";
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
                                totalScore: entry.totalScore.toFixed(2),
                                solveCount: entry.solveCount
                            }))))
                            .digest('hex');

                        // Check if there are changes
                        if (newLeaderboardHash === leaderboardTrack.lastHash) {
                            console.log(`No changes in leaderboard ${leaderboardTrack.messageId}, skipping update`);
                            continue;
                        }

                        console.log(`Changes detected in leaderboard ${leaderboardTrack.messageId}, updating...`);

                        // Create updated embed using the same logic as the original command
                        const updatedEmbed = await createLeaderboardEmbed(leaderboard, leaderboardTrack.isGlobal, leaderboardTrack.limit);
                        
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

// Helper function to create leaderboard embed (extracted from the main command)
async function createLeaderboardEmbed(leaderboard: any[], isGlobal: boolean, limit: number): Promise<EmbedBuilder> {
    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle(`${isGlobal ? 'Global ' : ''}Leaderboard 🏆`)
        .setTimestamp()
        .setFooter({ 
            text: 'CTF Assistant • Auto-updating hourly', 
            iconURL: 'https://tcp1p.team/favicon.ico' 
        });

    if (leaderboard.length === 0) {
        embed.setColor('#ff9900')
            .setDescription('No solves found yet!');
        return embed;
    }

    if (!isGlobal && leaderboard.length > 0) {
        // Show CTF-specific description if available
        const firstEntry = leaderboard[0];
        if (firstEntry.ctfBreakdown.size === 1) {
            const ctfInfo = Array.from(firstEntry.ctfBreakdown.values())[0] as { ctfTitle: string; weight: number; };
            embed.setDescription(`Showing results for **${ctfInfo.ctfTitle}** (Weight: ${ctfInfo.weight})`);
        }
    }

    // Create leaderboard description
    let description = '';
    const medals = ['🥇', '🥈', '🥉'];
    
    for (let i = 0; i < leaderboard.length; i++) {
        const entry = leaderboard[i];
        const position = i + 1;
        const medal = i < 3 ? medals[i] : `**${position}.**`;
        
        description += `${medal} <@${entry.userId}> - **${entry.totalScore.toFixed(2)}** pts (${entry.solveCount} solves)\n`;
        
        // Add detailed stats for top 3
        if (i < 3) {
            const diversityStats = [];
            if (entry.ctfCount > 1) diversityStats.push(`${entry.ctfCount} CTFs`);
            if (entry.categories.size > 1) diversityStats.push(`${entry.categories.size} categories`);
            
            if (diversityStats.length > 0) {
                description += `   └ *Diversity:* ${diversityStats.join(', ')}\n`;
            }
            
            // Show recent high-value solves
            if (entry.recentSolves.length > 0) {
                const topSolves = entry.recentSolves.slice(0, 3);
                const solveList = topSolves.map((s: any) => `**[${s.category}]** ${s.challenge} (${s.points}pts)`).join(', ');
                description += `   └ *Top solves:* ${solveList}\n`;
            }
        }
        description += '\n';
    }

    // Add total statistics
    const totalUniquePlayers = leaderboard.length;
    const totalSolves = leaderboard.reduce((sum, entry) => sum + entry.solveCount, 0);
    const totalScore = leaderboard.reduce((sum, entry) => sum + entry.totalScore, 0).toFixed(2);
    const uniqueCTFs = new Set(leaderboard.flatMap(entry => Array.from(entry.ctfBreakdown.keys()))).size;

    embed.addFields(
        { 
            name: 'Competition Stats', 
            value: `👥 **${totalUniquePlayers}** players\n🎯 **${totalSolves}** total solves\n🏆 **${totalScore}** total points\n🏁 **${uniqueCTFs}** unique CTFs`, 
            inline: true 
        },
        {
            name: 'Scoring System',
            value: `📊 Normalized challenge score × CTF weight\n⚖️ All CTFs weighted equally regardless of point system`,
            inline: true
        }
    );

    if (description.length > 4096) {
        // Truncate if too long
        description = description.substring(0, 4000) + '\n... (truncated)';
    }

    embed.setDescription((embed.data.description || '') + '\n' + description);

    return embed;
}
