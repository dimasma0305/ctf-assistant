import { SubCommand } from "../../../Model/command";
import {
  SlashCommandSubcommandBuilder,
  PermissionsBitField,
  EmbedBuilder,
} from "discord.js";
import { TrakteerModel } from "../../../Database/connect";

export const command: SubCommand = {
  data: new SlashCommandSubcommandBuilder()
    .setName("status")
    .setDescription("Check Trakteer integration status"),
  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({
        content: "❌ This command can only be used in a server!",
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const config = await TrakteerModel.findOne({
        guild_id: interaction.guild.id,
      });

      if (!config) {
        const embed = new EmbedBuilder()
          .setTitle("ℹ️ Trakteer Integration Status")
          .setDescription(
            "No Trakteer integration found for this server.\n\nSet it up using `/trakteer setup`."
          )
          .setColor(0xffa500)
          .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
      }

      // Try to fetch current balance
      let balanceInfo = "Unable to fetch";
      try {
        const balanceResponse = await fetch(
          "https://api.trakteer.id/v1/public/current-balance",
          {
            method: "GET",
            headers: {
              key: config.api_key,
              Accept: "application/json",
              "X-Requested-With": "XMLHttpRequest",
            },
          }
        );

        if (balanceResponse.ok) {
          const balanceData = await balanceResponse.json() as any;
          balanceInfo = `Rp ${parseFloat(balanceData.result).toLocaleString(
            "id-ID"
          )}`;
        }
      } catch (error) {
        console.error("Error fetching balance:", error);
      }

      const embed = new EmbedBuilder()
        .setTitle("ℹ️ Trakteer Integration Status")
        .setDescription(
          `Trakteer integration is ${
            config.is_active ? "**active** ✅" : "**disabled** ❌"
          }`
        )
        .addFields(
          { name: "Channel", value: `<#${config.channel_id}>`, inline: true },
          { name: "Current Balance", value: balanceInfo, inline: true },
          {
            name: "Last Checked",
            value: config.last_checked
              ? `<t:${Math.floor(config.last_checked.getTime() / 1000)}:R>`
              : "Never",
            inline: true,
          },
          {
            name: "Trakteer Link",
            value: config.page_url || "Not set",
            inline: false,
          }
        )
        .setColor(config.is_active ? 0x00ff00 : 0xff0000)
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("Error checking Trakteer status:", error);
      return interaction.editReply({
        content: `❌ Failed to check Trakteer status: ${
          error instanceof Error ? error.message : String(error)
        }`,
      });
    }
  },
};

