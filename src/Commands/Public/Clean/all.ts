import { SubCommand } from "../../../Model/command";
import { SlashCommandSubcommandBuilder } from "discord.js";

export const command: SubCommand = {
    data: new SlashCommandSubcommandBuilder()
        .setName('all')
        .setDescription('clean all message')
        .addIntegerOption((option) => option
            .setName("limit")
            .setDescription("Add limit message to fetch")
            .setRequired(false)
        ),
    async execute(interaction, _client) {
        await interaction.deferReply({ flags: ["Ephemeral"] })
        try {
            const limit = interaction.options.getInteger('limit') || 10;
            const curent_channel = interaction.channel
            const channels = await interaction.guild?.channels.fetch();
            if (curent_channel == null){
                throw Error("channel not found")
            }
            if (channels) {
                channels.forEach(async (channel) => {
                    if (channel?.id == curent_channel.id) {
                        if (channel.isTextBased()){
                            const messages = await channel.messages.fetch({ limit });
                            messages.forEach(async (message) => {
                                message.delete();
                            });
                        }
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
