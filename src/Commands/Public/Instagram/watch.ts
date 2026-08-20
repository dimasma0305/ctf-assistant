import { SubCommand } from "../../../Model/command";
import { EmbedBuilder, SlashCommandSubcommandBuilder } from "discord.js";
import { InstagramWatchStateModel } from "../../../Database/connect";
import { normalizeInstagramUsername } from "../../../Services/Instagram/monitor";

const RESERVED_INSTAGRAM_PATHS = new Set([
  "accounts",
  "direct",
  "directory",
  "explore",
  "p",
  "reel",
  "reels",
  "stories",
]);

function parseInstagramProfileUrl(input: string): { username: string; profileUrl: string } | null {
  try {
    const url = new URL(input.trim());
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    const pathParts = url.pathname.split("/").filter(Boolean);

    if (url.protocol !== "https:" || hostname !== "instagram.com" || pathParts.length !== 1) {
      return null;
    }

    const username = normalizeInstagramUsername(pathParts[0]);
    if (
      !username ||
      RESERVED_INSTAGRAM_PATHS.has(username) ||
      !/^[a-z0-9._]{1,30}$/i.test(username)
    ) {
      return null;
    }

    return {
      username,
      profileUrl: `https://www.instagram.com/${username}/`,
    };
  } catch {
    return null;
  }
}

export const command: SubCommand = {
  data: new SlashCommandSubcommandBuilder()
    .setName("watch")
    .setDescription("Register this channel to monitor an Instagram profile")
    .addStringOption((option) =>
      option
        .setName("profile_url")
        .setDescription("Instagram profile URL (ex: https://www.instagram.com/username)")
        .setRequired(true)
    ),
  allowedRoles: ["Mabar Manager"],
  async execute(interaction, _client) {
    if (!interaction.guild) {
      await interaction.reply({ content: "❌ This command can only be used in a server!", flags: ["Ephemeral"] });
      return;
    }

    const channel = interaction.channel;
    if (!channel || !channel.isTextBased()) {
      await interaction.reply({ content: "❌ This command must be used in a text channel.", flags: ["Ephemeral"] });
      return;
    }

    const inputUrl = interaction.options.getString("profile_url", true);
    const parsedProfile = parseInstagramProfileUrl(inputUrl);
    if (!parsedProfile) {
      await interaction.reply({
        content: "❌ Invalid Instagram profile URL. Example: https://www.instagram.com/username",
        flags: ["Ephemeral"],
      });
      return;
    }

    if (!process.env.BRIGHTDATA_API_TOKEN?.trim()) {
      await interaction.reply({
        content: "❌ Instagram monitor is not configured. Set BRIGHTDATA_API_TOKEN in env and restart the bot.",
        flags: ["Ephemeral"],
      });
      return;
    }

    await interaction.deferReply({ flags: ["Ephemeral"] });

    try {
      const resolved = {
        accountId: parsedProfile.username,
        username: parsedProfile.username,
      };

      const existing = await InstagramWatchStateModel.findOne({
        guild_id: interaction.guild.id,
        channel_id: channel.id,
      });

      if (existing) {
        existing.account_id = resolved.accountId;
        existing.username = resolved.username;
        existing.profile_url = parsedProfile.profileUrl;
        existing.source_account_id = "brightdata";
        existing.is_active = true;
        existing.last_post_id = null;
        existing.configured_by = interaction.user.id;
        existing.updated_at = new Date();
        await existing.save();
      } else {
        await InstagramWatchStateModel.create({
          guild_id: interaction.guild.id,
          channel_id: channel.id,
          profile_url: parsedProfile.profileUrl,
          username: resolved.username,
          account_id: resolved.accountId,
          source_account_id: "brightdata",
          is_active: true,
          configured_by: interaction.user.id,
          created_at: new Date(),
          updated_at: new Date(),
          last_post_id: null,
        });
      }

      const embed = new EmbedBuilder()
        .setTitle("✅ Instagram monitor started")
        .setColor(0x00ae86)
        .setDescription(`This channel will receive weekly batched post updates from **@${resolved.username}**.`)
        .addFields(
          { name: "Channel", value: `<#${channel.id}>`, inline: true },
          { name: "Profile", value: `[${resolved.username}](${parsedProfile.profileUrl})`, inline: true },
          { name: "Mode", value: "Bright Data weekly batch", inline: false }
        );

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("[InstagramWatch setup] failed:", error);
      await interaction.editReply({
        content: `❌ Failed to register watch: ${error instanceof Error ? error.message : "unknown error"}`,
      });
    }
  },
};
