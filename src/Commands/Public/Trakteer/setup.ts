import { SubCommand } from "../../../Model/command";
import {
  SlashCommandSubcommandBuilder,
  PermissionsBitField,
  ChannelType,
  EmbedBuilder,
  TextChannel,
} from "discord.js";
import { TrakteerModel } from "../../../Database/connect";

export const command: SubCommand = {
  data: new SlashCommandSubcommandBuilder()
    .setName("setup")
    .setDescription("Set up Trakteer integration for a channel")
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("The channel to post Trakteer updates")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("api_key")
        .setDescription("Your Trakteer API key")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("page_url")
        .setDescription("Your Trakteer page link (e.g. https://trakteer.id/username)")
        .setRequired(false)
    ),
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

    const channel = interaction.options.getChannel("channel", true) as TextChannel;
    const apiKey = interaction.options.getString("api_key", true);
    const pageUrl = interaction.options.getString("page_url") || "";

    await interaction.deferReply({ ephemeral: true });

    try {
      // Verify API key works by making a test request
      const testResponse = await fetch(
        "https://api.trakteer.id/v1/public/current-balance",
        {
          method: "GET",
          headers: {
            key: apiKey,
            Accept: "application/json",
            "X-Requested-With": "XMLHttpRequest",
          },
        }
      );

      if (!testResponse.ok) {
        return interaction.editReply({
          content: `❌ Invalid API key! Status: ${testResponse.status} ${testResponse.statusText}\n\nPlease check your API key and try again.`,
        });
      }

      const testData = await testResponse.json() as any;
      if (testData.status !== "success") {
        return interaction.editReply({
          content: `❌ API key validation failed: ${testData.message}`,
        });
      }

      // Check if configuration already exists
      let existingConfig = await TrakteerModel.findOne({
        guild_id: interaction.guild.id,
      });

      if (existingConfig) {
        // Update existing configuration
        existingConfig.channel_id = channel.id;
        existingConfig.api_key = apiKey;
        existingConfig.page_url = pageUrl || existingConfig.page_url || "";
        existingConfig.is_active = true;
        existingConfig.updated_at = new Date();
        await existingConfig.save();

        const embed = new EmbedBuilder()
          .setTitle("✅ Trakteer Configuration Updated")
          .setDescription(
            `Successfully updated Trakteer integration for this server.`
          )
          .addFields(
            { name: "Channel", value: `<#${channel.id}>`, inline: true },
            {
              name: "Current Balance",
              value: `Rp ${parseFloat(testData.result).toLocaleString("id-ID")}`,
              inline: true,
            }
          )
          .addFields(
            pageUrl
              ? { name: "Trakteer Link", value: pageUrl, inline: false }
              : { name: "Trakteer Link", value: existingConfig.page_url || "Not set", inline: false }
          )
          .setColor(0x00ff00)
          .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
      } else {
        // Create new configuration
        const newConfig = new TrakteerModel({
          guild_id: interaction.guild.id,
          channel_id: channel.id,
          api_key: apiKey,
          page_url: pageUrl,
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
        });

        await newConfig.save();

        const embed = new EmbedBuilder()
          .setTitle("✅ Trakteer Integration Set Up")
          .setDescription(
            `Successfully set up Trakteer integration for this server!`
          )
          .addFields(
            { name: "Channel", value: `<#${channel.id}>`, inline: true },
            {
              name: "Current Balance",
              value: `Rp ${parseFloat(testData.result).toLocaleString("id-ID")}`,
              inline: true,
            },
            {
              name: "Status",
              value: "✅ Active - Will check for new supports every 5 minutes",
              inline: false,
            }
          )
          .addFields(
            pageUrl
              ? { name: "Trakteer Link", value: pageUrl, inline: false }
              : { name: "Trakteer Link", value: "Not set", inline: false }
          )
          .setColor(0x00ff00)
          .setTimestamp();

        // Send a test message to the configured channel
        try {
          const testEmbed = new EmbedBuilder()
            .setTitle("🎉 Trakteer Integration Active!")
            .setDescription(
              "This channel will now receive notifications when someone supports you on Trakteer."
            )
            .setColor(0xff6b35)
            .setTimestamp();

          await channel.send({ embeds: [testEmbed] });
        } catch (error) {
          console.error("Error sending test message:", error);
        }

        return interaction.editReply({ embeds: [embed] });
      }
    } catch (error) {
      console.error("Error setting up Trakteer integration:", error);
      return interaction.editReply({
        content: `❌ Failed to set up Trakteer integration: ${
          error instanceof Error ? error.message : String(error)
        }`,
      });
    }
  },
};

