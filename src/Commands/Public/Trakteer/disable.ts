import { SubCommand } from "../../../Model/command";
import {
  SlashCommandSubcommandBuilder,
  PermissionsBitField,
  EmbedBuilder,
} from "discord.js";
import { TrakteerModel } from "../../../Database/connect";

export const command: SubCommand = {
  data: new SlashCommandSubcommandBuilder()
    .setName("disable")
    .setDescription("Disable Trakteer integration for this server"),
  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({
        content: "❌ This command can only be used in a server!",
        ephemeral: true,
      });
    }

    // Check for admin permissions
    const member = interaction.guild.members.cache.get(interaction.user.id);
    if (!member?.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({
        content: "❌ You need Administrator permissions to use this command!",
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const config = await TrakteerModel.findOne({
        guild_id: interaction.guild.id,
      });

      if (!config) {
        return interaction.editReply({
          content: "❌ No Trakteer integration found for this server!",
        });
      }

      config.is_active = false;
      config.updated_at = new Date();
      await config.save();

      const embed = new EmbedBuilder()
        .setTitle("✅ Trakteer Integration Disabled")
        .setDescription(
          "Trakteer updates have been disabled for this server.\n\nYou can re-enable it anytime using `/trakteer setup`."
        )
        .setColor(0xff0000)
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("Error disabling Trakteer integration:", error);
      return interaction.editReply({
        content: `❌ Failed to disable Trakteer integration: ${
          error instanceof Error ? error.message : String(error)
        }`,
      });
    }
  },
};

