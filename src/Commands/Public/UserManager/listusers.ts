import { SubCommand } from "../../../Model/command";
import {
  SlashCommandSubcommandBuilder,
  TextChannel,
  VoiceChannel,
  ChannelType,
  PermissionFlagsBits,
} from "discord.js";

export const command: SubCommand = {
  data: new SlashCommandSubcommandBuilder()
    .setName("listusers")
    .setDescription("List users who have explicit access to a channel")
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("The channel to list users from")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildVoice)
        .setRequired(true)
    ),
  async execute(interaction, _client) {
    const { options, guild } = interaction;

    if (!guild) {
      await interaction.reply({
        content: "❌ This command can only be used in a server!",
        flags: ["Ephemeral"],
      });
      return;
    }

    await interaction.deferReply({ flags: ["Ephemeral"] });

    try {
      const channel = options.getChannel("channel", true);

      // Validate channel type
      if (
        !(channel instanceof TextChannel) &&
        !(channel instanceof VoiceChannel)
      ) {
        await interaction.editReply({
          content: "❌ Channel must be a text or voice channel!",
        });
        return;
      }

      // Get permission overwrites for users
      const userOverwrites = channel.permissionOverwrites.cache.filter(
        (overwrite) => overwrite.type === 1 // 1 = Member, 0 = Role
      );

      if (userOverwrites.size === 0) {
        await interaction.editReply({
          content: `ℹ️ No explicit user permissions set for ${channel}.\n\nThis channel uses default role permissions.`,
        });
        return;
      }

      const usersWithAccess: string[] = [];
      const usersWithoutAccess: string[] = [];

      for (const [userId, overwrite] of userOverwrites) {
        try {
          const member = await guild.members.fetch(userId);
          const canView = overwrite.allow.has(PermissionFlagsBits.ViewChannel);
          const isDenied = overwrite.deny.has(PermissionFlagsBits.ViewChannel);

          if (canView || (!isDenied && overwrite.allow.bitfield > 0n)) {
            usersWithAccess.push(`• ${member.user.tag} (<@${userId}>)`);
          } else if (isDenied) {
            usersWithoutAccess.push(`• ${member.user.tag} (<@${userId}>)`);
          }
        } catch (error) {
          console.error(`Failed to fetch user ${userId}:`, error);
        }
      }

      let responseMessage = `📋 **User Permissions for ${channel}**\n\n`;

      if (usersWithAccess.length > 0) {
        responseMessage += `✅ **Users with Access (${usersWithAccess.length}):**\n`;
        responseMessage += usersWithAccess.join("\n");
        responseMessage += "\n\n";
      }

      if (usersWithoutAccess.length > 0) {
        responseMessage += `❌ **Users without Access (${usersWithoutAccess.length}):**\n`;
        responseMessage += usersWithoutAccess.join("\n");
      }

      if (usersWithAccess.length === 0 && usersWithoutAccess.length === 0) {
        responseMessage += `ℹ️ No user permissions configured for this channel.`;
      }

      await interaction.editReply({
        content: responseMessage,
      });
    } catch (error) {
      console.error("❌ Error in listusers command:", error);
      await interaction.editReply({
        content:
          "❌ An error occurred while listing users. Please try again later.",
      });
    }
  },
};

