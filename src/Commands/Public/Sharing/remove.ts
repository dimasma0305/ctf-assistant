import { SubCommand } from "../../../Model/command";
import { SlashCommandSubcommandBuilder, ChannelType } from "discord.js";
import { SharingChannelConfigModel } from "../../../Database/connect";

export const command: SubCommand = {
    data: new SlashCommandSubcommandBuilder()
        .setName('remove')
        .setDescription('Stop auto-cleaning a channel (removes the sharing-channel config)')
        .addChannelOption((option) => option
            .setName('channel')
            .setDescription('Channel to stop cleaning (defaults to current channel)')
            .addChannelTypes(
                ChannelType.GuildText,
                ChannelType.GuildAnnouncement,
                ChannelType.PublicThread,
                ChannelType.PrivateThread,
                ChannelType.AnnouncementThread,
            )
            .setRequired(false)),
    async execute(interaction, _client) {
        await interaction.deferReply({ flags: ["Ephemeral"] });
        try {
            const channel = interaction.options.getChannel('channel') || interaction.channel;
            if (!channel || !('id' in channel)) {
                await interaction.editReply('❌ Could not resolve target channel.');
                return;
            }
            const result = await SharingChannelConfigModel.deleteOne({ channelId: channel.id });
            if (result.deletedCount === 0) {
                await interaction.editReply(`ℹ️ <#${channel.id}> wasn't configured as a sharing channel.`);
                return;
            }
            await interaction.editReply(`🧹 Removed <#${channel.id}> from sharing-channel cleanup. No more auto-pruning there.`);
            console.log(`🧹 [SharingConfig] removed #${(channel as any).name || channel.id} by ${interaction.user.tag}`);
        } catch (error) {
            console.error('[Sharing/remove] failed:', error);
            await interaction.editReply('❌ Something went wrong removing that channel. Check the bot logs.');
        }
    },
};
