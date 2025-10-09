import { SubCommand } from "../../../Model/command";
import { SlashCommandSubcommandBuilder, EmbedBuilder } from "discord.js";
import { GuildChannelModel } from "../../../Database/connect";

export const command: SubCommand = {
  data: new SlashCommandSubcommandBuilder()
    .setName("list")
    .setDescription("List all registered notification channels in this server"),
  allowedRoles: ["Mabar Manager", "Gas Mabar"],
  async execute(interaction, _client) {
    const { guild } = interaction;
    
    if (!guild) {
      await interaction.reply({ 
        content: "❌ This command can only be used in a server!", 
        flags: ["Ephemeral"] 
      });
      return;
    }

    await interaction.deferReply({ flags: ["Ephemeral"] });

    try {
      // Find all registrations for this guild
      const registrations = await GuildChannelModel.find({
        guild_id: guild.id
      }).sort({ created_at: -1 });

      if (registrations.length === 0) {
        await interaction.editReply({
          content: "📭 No channels are registered for notifications in this server.\n\n" +
                   "Use `/notify register` to register a channel!"
        });
        return;
      }

      // Create embed with registration information
      const embed = new EmbedBuilder()
        .setTitle("📢 Registered Notification Channels")
        .setColor(0x00AE86)
        .setDescription(`Found ${registrations.length} registered notification channel(s) in this server`)
        .setTimestamp();

      for (const reg of registrations) {
        const channel = await guild.channels.fetch(reg.channel_id).catch(() => null);
        const channelMention = channel ? `<#${reg.channel_id}>` : `~~${reg.channel_name}~~ (deleted)`;
        const status = reg.is_active ? "✅ Active" : "❌ Inactive";
        const registeredBy = `<@${reg.registered_by}>`;
        const registeredAt = new Date(reg.created_at).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        });
        
        const eventTypes = reg.event_types && reg.event_types.length > 0 
          ? reg.event_types.map(t => t.replace(/_/g, ' ')).join(', ')
          : 'weekly reminder';
        
        const lastNotification = reg.last_notification_sent 
          ? new Date(reg.last_notification_sent).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          : 'Never';
        
        const notificationStats = reg.notification_count 
          ? `**Notifications Sent:** ${reg.notification_count}\n**Last Sent:** ${lastNotification}\n`
          : '';

        embed.addFields({
          name: channelMention,
          value: `**Status:** ${status}\n` +
                 `**Event Types:** ${eventTypes}\n` +
                 `**Registered By:** ${registeredBy}\n` +
                 `**Registered On:** ${registeredAt}\n` +
                 notificationStats,
          inline: false
        });
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("❌ Error listing channels:", error);
      await interaction.editReply({
        content: "❌ An error occurred while fetching the channel list. Please try again later."
      });
    }
  },
};

