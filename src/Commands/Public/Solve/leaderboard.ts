import { SubCommand } from "../../../Model/command";
import { EmbedBuilder, SlashCommandSubcommandBuilder } from "discord.js";
import { solveModel } from "../../../Database/connect";
import { getChannelAndCTFData, validateCTFEvent } from "./utils";

interface LeaderboardEntry {
    userId: string;
    solves: number;
    challenges: string[];
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
        ),
    async execute(interaction, _client) {
        const isGlobal = interaction.options.getBoolean('global') ?? true;
        const limit = interaction.options.getInteger('limit') ?? 10;

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
            // Aggregate solves by user
            const solves = await solveModel.find(query).lean();
            
            if (solves.length === 0) {
                const embed = new EmbedBuilder()
                    .setColor('#ff9900')
                    .setTitle(`${isGlobal ? 'Global ' : ''}Leaderboard`)
                    .setDescription('No solves found yet!')
                    .setTimestamp()
                    .setFooter({ text: 'CTF Assistant', iconURL: 'https://tcp1p.team/favicon.ico' });

                await interaction.reply({ embeds: [embed] });
                return;
            }

            // Create a map to track user solve counts and challenges
            const userStats = new Map<string, LeaderboardEntry>();

            for (const solve of solves) {
                for (const userId of solve.users) {
                    if (!userStats.has(userId)) {
                        userStats.set(userId, {
                            userId,
                            solves: 0,
                            challenges: []
                        });
                    }
                    
                    const entry = userStats.get(userId)!;
                    entry.solves += 1;
                    entry.challenges.push(`**[${solve.category || 'Unknown'}]** ${solve.challenge}`);
                }
            }

            // Sort by number of solves (descending)
            const leaderboard = Array.from(userStats.values())
                .sort((a, b) => b.solves - a.solves)
                .slice(0, limit);

            // Create embed
            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle(`${isGlobal ? 'Global ' : ''}Leaderboard 🏆`)
                .setTimestamp()
                .setFooter({ text: 'CTF Assistant', iconURL: 'https://tcp1p.team/favicon.ico' });

            if (!isGlobal && solves.length > 0) {
                // Get CTF name from first solve
                const firstSolve = solves[0];
                embed.setDescription(`Showing results for CTF ID: \`${firstSolve.ctf_id}\``);
            }

            // Create leaderboard description
            let description = '';
            const medals = ['🥇', '🥈', '🥉'];
            
            for (let i = 0; i < leaderboard.length; i++) {
                const entry = leaderboard[i];
                const position = i + 1;
                const medal = i < 3 ? medals[i] : `**${position}.**`;
                
                description += `${medal} <@${entry.userId}> - **${entry.solves}** solve${entry.solves !== 1 ? 's' : ''}\n`;
                
                // Add some challenge details for top 3
                if (i < 3 && entry.challenges.length > 0) {
                    const challengeList = entry.challenges.slice(0, 3).join(', ');
                    const extraChallenges = entry.challenges.length > 3 ? ` (+${entry.challenges.length - 3} more)` : '';
                    description += `   └ *Recent:* ${challengeList}${extraChallenges}\n`;
                }
                description += '\n';
            }

            // Add total statistics
            const totalUniquePlayers = userStats.size;
            const totalSolves = Array.from(userStats.values()).reduce((sum, entry) => sum + entry.solves, 0);
            const uniqueChallenges = new Set(solves.map(solve => solve.challenge)).size;

            embed.addFields(
                { 
                    name: 'Statistics', 
                    value: `👥 **${totalUniquePlayers}** players\n🎯 **${totalSolves}** total solves\n🏁 **${uniqueChallenges}** unique challenges`, 
                    inline: true 
                }
            );

            if (description.length > 4096) {
                // Truncate if too long
                description = description.substring(0, 4000) + '\n... (truncated)';
            }

            embed.setDescription((embed.data.description || '') + '\n' + description);

            await interaction.reply({ embeds: [embed] });

        } catch (error) {
            console.error('Error fetching leaderboard:', error);
            await interaction.reply('An error occurred while fetching the leaderboard. Please try again later.');
        }
    },
};
