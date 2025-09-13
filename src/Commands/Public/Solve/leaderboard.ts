import { SubCommand } from "../../../Model/command";
import { EmbedBuilder, SlashCommandSubcommandBuilder, Message } from "discord.js";
import crypto from 'crypto';
import { solveModel, LeaderboardTrackingModel } from "../../../Database/connect";
import { getChannelAndCTFData, validateCTFEvent, createLeaderboardEmbed, LeaderboardEntry } from "./utils";
import FairScoringSystem from "../../../Functions/scoringSystem";

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
            
            // Create embed using shared utility function (handles empty leaderboard case)
            const embed = createLeaderboardEmbed(leaderboard, isGlobal, limit, autoUpdate);

            const response = await interaction.reply({ embeds: [embed], fetchReply: true }) as Message;

            // Set up auto-updating if enabled
            if (autoUpdate) {
                try {
                    // Create hash of current leaderboard data for change detection
                    const leaderboardHash = crypto.createHash('md5')
                        .update(JSON.stringify(leaderboard.map(entry => ({
                            userId: entry.userId,
                            totalScore: entry.totalScore,
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
