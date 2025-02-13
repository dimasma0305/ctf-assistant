import { SubCommand } from "../../../Model/command";
import { SlashCommandSubcommandBuilder } from "discord.js";

export const command: SubCommand = {
    data: new SlashCommandSubcommandBuilder()
        .setName('username')
        .setDescription('username')
        .addUserOption((option) => option
            .setName("username")
            .setDescription("Delete by username")
        )
        .addIntegerOption((option) => option
            .setName("limit")
            .setDescription("Add limit message to fetch")
            .setRequired(false)
        ),
    async execute(interaction, _client) {
        await interaction.deferReply({ ephemeral: true })
        try {
            const username = interaction.options.getUser('username')?.username;
            const limit = interaction.options.getInteger('limit') || 10;

            const channels = await interaction.guild?.channels.fetch();
            if (channels) {
                channels.forEach(async (channel) => {
                    if (channel?.isTextBased()) {
                        const messages = await channel.messages.fetch({ limit });
                        messages.forEach(async (message) => {
                            if (message.author.username === username) {
                                await message.delete();
                            }
                        });
                    }
                });
            }
            await interaction.editReply('Messages removed successfully.');
        } catch (error) {
            console.error(error);
            await interaction.editReply('An error occurred while processing your request.');
        }
    },
};
