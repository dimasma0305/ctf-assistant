import { SubCommand } from "../../../Model/command";
import { SlashCommandSubcommandBuilder } from "discord.js";
import { InstagramWatchStateModel } from "../../../Database/connect";

export const command: SubCommand = {
  data: new SlashCommandSubcommandBuilder()
    .setName("unwatch")
    .setDescription("Stop Instagram monitoring for this channel"),
  allowedRoles: ["Mabar Manager"],
  async execute(interaction, _client) {
    if (!interaction.guild) {
      await interaction.reply({ content: "❌ This command can only be used in a server!", flags: ["Ephemeral"] });
      return;
    }

    const channel = interaction.channel;
    if (!channel || !channel.isTextBased()) {
      await interaction.reply({ content: "❌ Could not detect the current channel.", flags: ["Ephemeral"] });
      return;
    }

    await interaction.deferReply({ flags: ["Ephemeral"] });

    const existing = await InstagramWatchStateModel.findOne({
      guild_id: interaction.guild.id,
      channel_id: channel.id,
    });
    if (!existing) {
      await interaction.editReply({ content: "⚠️ This channel is not registered for Instagram monitoring." });
      return;
    }

    existing.is_active = false;
    existing.updated_at = new Date();
    await existing.save();

    await interaction.editReply({ content: "✅ Instagram monitoring disabled for this channel." });
  },
};
