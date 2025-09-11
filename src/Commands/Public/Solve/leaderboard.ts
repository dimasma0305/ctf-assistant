import { SubCommand } from "../../../Model/command";
import { EmbedBuilder, SlashCommandSubcommandBuilder, Message } from "discord.js";
import crypto from 'crypto';
import { solveModel, LeaderboardTrackingModel } from "../../../Database/connect";
import { getChannelAndCTFData, validateCTFEvent } from "./utils";
import FairScoringSystem from "../../../Functions/scoringSystem";

interface LeaderboardEntry {
    userId: string;
    totalScore: number;
    solveCount: number;
    ctfCount: number;
    categories: Set<string>;
    recentSolves: any[];
    ctfBreakdown: Map<string, any>;
}

export const command: SubCommand = {
    data: new SlashCommandSubcommandBuilder()
        .setName('leaderboard')
        .setDescription('Show the leaderboard based on solved challenges')
        .addBooleanOption(option => option
            .setName('global')
            .setDescription('Show global leaderboard across all CTFs (default: true)')
            .setRequired(false)
        )
        .addIntegerOption(option => option
            .setName('limit')
            .setDescription('Number of top players to show (default: 10, max: 25)')
            .setMinValue(1)
            .setMaxValue(25)
            .setRequired(false)
        )
        .addBooleanOption(option => option
            .setName('auto_update')
            .setDescription('Enable hourly auto-updates for this leaderboard (default: false)')
            .setRequired(false)
        ),
    async execute(interaction, _client) {
        const isGlobal = interaction.options.getBoolean('global') ?? true;
        const limit = interaction.options.getInteger('limit') ?? 10;
        const autoUpdate = interaction.options.getBoolean('auto_update') ?? false;

        let query: any = {};

        // If not global, filter by current CTF
        if (!isGlobal) {
            const channel = interaction.channel;
            if (!channel) {
                await interaction.reply("This command can only be used in a channel.");
                return;
            }

            const result = await getChannelAndCTFData(channel);
            if (!result) {
                await interaction.reply("This command can only be used in a server.");
                return;
            }

            const { ctfData } = result;
            
            if (!validateCTFEvent(ctfData)) {
                await interaction.reply("This channel does not have a valid CTF event associated with it. Use `global: true` for global leaderboard.");
                return;
            }

            query.ctf_id = ctfData.id;
        }

        try {
            // Get leaderboard using fair scoring system
            const leaderboard = await FairScoringSystem.getLeaderboard(query, limit);
            
            if (leaderboard.length === 0) {
                const embed = new EmbedBuilder()
                    .setColor('#ff9900')
                    .setTitle(`${isGlobal ? 'Global ' : ''}Leaderboard`)
                    .setDescription('No solves found yet!')
                    .setTimestamp()
                    .setFooter({ text: 'CTF Assistant', iconURL: 'https://tcp1p.team/favicon.ico' });

                await interaction.reply({ embeds: [embed] });
                return;
            }

            // Create embed
            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle(`${isGlobal ? 'Global ' : ''}Leaderboard 🏆`)
                .setTimestamp()
                .setFooter({ text: 'CTF Assistant', iconURL: 'https://tcp1p.team/favicon.ico' });

            if (!isGlobal && leaderboard.length > 0) {
                // Show CTF-specific description if available
                const firstEntry = leaderboard[0];
                if (firstEntry.ctfBreakdown.size === 1) {
                    const ctfInfo = Array.from(firstEntry.ctfBreakdown.values())[0];
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
                        const solveList = topSolves.map(s => `**[${s.category}]** ${s.challenge} (${s.points}pts)`).join(', ');
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

            // Add footer indicator if auto-update is enabled
            if (autoUpdate) {
                const currentFooter = embed.data.footer?.text || 'CTF Assistant';
                embed.setFooter({ 
                    text: `${currentFooter} • Auto-updating hourly`, 
                    iconURL: embed.data.footer?.icon_url || 'https://tcp1p.team/favicon.ico' 
                });
            }

            const response = await interaction.reply({ embeds: [embed], fetchReply: true }) as Message;

            // Set up auto-updating if enabled
            if (autoUpdate) {
                try {
                    // Create hash of current leaderboard data for change detection
                    const leaderboardHash = crypto.createHash('md5')
                        .update(JSON.stringify(leaderboard.map(entry => ({
                            userId: entry.userId,
                            totalScore: entry.totalScore.toFixed(2),
                            solveCount: entry.solveCount
                        }))))
                        .digest('hex');

                    await LeaderboardTrackingModel.create({
                        messageId: response.id,
                        channelId: interaction.channelId!,
                        guildId: interaction.guildId!,
                        isGlobal,
                        limit,
                        ctfId: query.ctf_id || null,
                        lastHash: leaderboardHash,
                        lastUpdated: new Date(),
                        isActive: true
                    });

                    console.log(`✅ Auto-update enabled for leaderboard in ${interaction.guildId}/${interaction.channelId}`);
                } catch (error) {
                    console.error('Error setting up auto-update:', error);
                    // Don't fail the command, just log the error
                }
            }

        } catch (error) {
            console.error('Error fetching leaderboard:', error);
            await interaction.reply('An error occurred while fetching the leaderboard. Please try again later.');
        }
    },
};
