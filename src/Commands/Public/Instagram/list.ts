import { SubCommand } from "../../../Model/command";
import { EmbedBuilder, SlashCommandSubcommandBuilder } from "discord.js";
import { InstagramWatchStateModel } from "../../../Database/connect";

export const command: SubCommand = {
  data: new SlashCommandSubcommandBuilder()
    .setName("list")
    .setDescription("List Instagram profile monitors in this server"),
  allowedRoles: ["Mabar Manager"],
  async execute(interaction, _client) {
    if (!interaction.guild) {
      await interaction.reply({ content: "❌ This command can only be used in a server!", flags: ["Ephemeral"] });
      return;
    }

    await interaction.deferReply({ flags: ["Ephemeral"] });

    const watches = await InstagramWatchStateModel.find({
      guild_id: interaction.guild.id,
    }).sort({ created_at: -1 }).lean();

    if (watches.length === 0) {
      await interaction.editReply({ content: "📭 No Instagram monitors configured for this server." });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle("📷 Instagram Monitors")
      .setColor(0x833ab4)
      .setDescription("Monitor configuration list by channel");

    for (const watch of watches) {
      const status = watch.is_active ? "✅ Active" : "⏸️ Paused";
      const channelMention = `<#${watch.channel_id}>`;
      embed.addFields({
        name: `${channelMention} — @${watch.username}`,
        value: `**URL:** ${watch.profile_url}\n**Status:** ${status}\n**Configured by:** ${watch.configured_by ? `<@${watch.configured_by}>` : "unknown"}`,
        inline: false,
      });
    }

    await interaction.editReply({ embeds: [embed] });
  },
};
