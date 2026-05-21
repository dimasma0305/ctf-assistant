import { SubCommand } from "../../../Model/command";
import { SlashCommandSubcommandBuilder, ChannelType } from "discord.js";
import { SharingChannelConfigModel } from "../../../Database/connect";

export const command: SubCommand = {
    data: new SlashCommandSubcommandBuilder()
        .setName('add')
        .setDescription('Designate a channel as a sharing channel (auto-cleans non-sharing messages every 30 min)')
        .addChannelOption((option) => option
            .setName('channel')
            .setDescription('The channel to manage (defaults to current channel)')
            .addChannelTypes(
                ChannelType.GuildText,
                ChannelType.GuildAnnouncement,
                ChannelType.PublicThread,
                ChannelType.PrivateThread,
                ChannelType.AnnouncementThread,
            )
            .setRequired(false))
        .addIntegerOption((option) => option
            .setName('grace_minutes')
            .setDescription('Minutes a freshly-posted message is exempt (default 30, min 1, max 1440)')
            .setMinValue(1)
            .setMaxValue(1440)
            .setRequired(false)),
    async execute(interaction, _client) {
        await interaction.deferReply({ flags: ["Ephemeral"] });
        try {
            const channel = interaction.options.getChannel('channel') || interaction.channel;
            if (!channel || !('id' in channel)) {
                await interaction.editReply('❌ Could not resolve target channel.');
                return;
            }
            const grace = interaction.options.getInteger('grace_minutes') ?? 30;
            const guildId = interaction.guildId;
            if (!guildId) {
                await interaction.editReply('❌ This command must be used in a guild.');
                return;
            }

            const existing = await SharingChannelConfigModel.findOne({ channelId: channel.id }).lean();
            if (existing) {
                // Update grace period if it differs; otherwise no-op.
                await SharingChannelConfigModel.updateOne(
                    { channelId: channel.id },
                    { $set: { gracePeriodMin: grace } },
                );
                await interaction.editReply(
                    `🧹 <#${channel.id}> is already a sharing channel — updated grace period to **${grace} min**.`,
                );
                return;
            }

            await SharingChannelConfigModel.create({
                guildId,
                channelId: channel.id,
                gracePeriodMin: grace,
                exemptUserIds: [],
                exemptRoleIds: [],
            });
            await interaction.editReply(
                `🧹 Added <#${channel.id}> as a sharing channel. Grace period: **${grace} min**. ` +
                `Cleanup runs every 30 min — messages without attachment/embed/URL/long-text/pinned status will be pruned.`,
            );
            console.log(`🧹 [SharingConfig] added #${(channel as any).name || channel.id} by ${interaction.user.tag}`);
        } catch (error) {
            console.error('[Sharing/add] failed:', error);
            await interaction.editReply('❌ Something went wrong adding that channel. Check the bot logs.');
        }
    },
};
