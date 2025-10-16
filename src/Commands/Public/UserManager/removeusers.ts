import { SubCommand } from "../../../Model/command";
import {
  SlashCommandSubcommandBuilder,
  TextChannel,
  VoiceChannel,
  ChannelType,
  User,
} from "discord.js";

export const command: SubCommand = {
  data: new SlashCommandSubcommandBuilder()
    .setName("removeusers")
    .setDescription("Parse user mentions from a message and remove them from a channel")
    .addStringOption((option) =>
      option
        .setName("message_id")
        .setDescription("The message ID or URL containing user mentions")
        .setRequired(true)
    )
    .addChannelOption((option) =>
      option
        .setName("target_channel")
        .setDescription("The channel to remove users from")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildVoice)
        .setRequired(true)
    )
    .addChannelOption((option) =>
      option
        .setName("source_channel")
        .setDescription("The channel where the message is located (if not current channel)")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false)
    ),
  async execute(interaction, _client) {
    const { options, guild, channel: currentChannel } = interaction;

    if (!guild) {
      await interaction.reply({
        content: "❌ This command can only be used in a server!",
        flags: ["Ephemeral"],
      });
      return;
    }

    await interaction.deferReply({ flags: ["Ephemeral"] });

    try {
      // Get options
      const messageInput = options.getString("message_id", true);
      const targetChannel = options.getChannel("target_channel", true);
      const sourceChannel = (options.getChannel("source_channel") ||
        currentChannel) as TextChannel;

      // Validate channels
      if (!sourceChannel || !(sourceChannel instanceof TextChannel)) {
        await interaction.editReply({
          content: "❌ Source channel must be a text channel!",
        });
        return;
      }

      if (!targetChannel) {
        await interaction.editReply({
          content: "❌ Please specify a valid target channel!",
        });
        return;
      }

      // Validate target channel type supports permissions
      if (
        !(targetChannel instanceof TextChannel) &&
        !(targetChannel instanceof VoiceChannel)
      ) {
        await interaction.editReply({
          content: "❌ Target channel must be a text or voice channel (not a thread)!",
        });
        return;
      }

      // Parse message ID from URL or direct ID
      let messageId = messageInput;
      const urlMatch = messageInput.match(/\/channels\/\d+\/\d+\/(\d+)/);
      if (urlMatch) {
        messageId = urlMatch[1];
      }

      // Fetch the message
      const message = await sourceChannel.messages.fetch(messageId);

      if (!message) {
        await interaction.editReply({
          content: "❌ Could not find the specified message!",
        });
        return;
      }

      // Parse user mentions using regex
      const userMentionRegex = /<@!?(\d+)>/g;
      const userIds = new Set<string>();
      let match;

      while ((match = userMentionRegex.exec(message.content)) !== null) {
        userIds.add(match[1]);
      }

      if (userIds.size === 0) {
        await interaction.editReply({
          content: "❌ No user mentions found in the message!",
        });
        return;
      }

      // Collect users
      const users: User[] = [];
      const failedUsers: string[] = [];

      for (const userId of userIds) {
        try {
          const user = await guild.members.fetch(userId);
          if (user) {
            users.push(user.user);
          }
        } catch (error) {
          failedUsers.push(userId);
          console.error(`Failed to fetch user ${userId}:`, error);
        }
      }

      if (users.length === 0) {
        await interaction.editReply({
          content: "❌ Could not fetch any of the mentioned users!",
        });
        return;
      }

      // Remove users from the target channel
      const removedUsers: string[] = [];
      const errorUsers: string[] = [];

      for (const user of users) {
        try {
          const member = await guild.members.fetch(user.id);
          
          // Remove permission overwrite for the user
          await targetChannel.permissionOverwrites.delete(member);

          removedUsers.push(user.tag);
        } catch (error) {
          errorUsers.push(user.tag);
          console.error(`Failed to remove ${user.tag} from channel:`, error);
        }
      }

      // Build response message
      let responseMessage = "";

      if (removedUsers.length > 0) {
        responseMessage += `✅ Successfully removed ${removedUsers.length} user(s) from ${targetChannel}:\n`;
        responseMessage += removedUsers.map((tag) => `• ${tag}`).join("\n");
      }

      if (errorUsers.length > 0) {
        responseMessage += `\n\n⚠️ Failed to remove ${errorUsers.length} user(s):\n`;
        responseMessage += errorUsers.map((tag) => `• ${tag}`).join("\n");
      }

      if (failedUsers.length > 0) {
        responseMessage += `\n\n⚠️ Could not fetch ${failedUsers.length} user ID(s):\n`;
        responseMessage += failedUsers.map((id) => `• <@${id}>`).join("\n");
      }

      responseMessage += `\n\n📊 Total users found: ${userIds.size}`;
      responseMessage += `\n✅ Successfully removed: ${removedUsers.length}`;

      await interaction.editReply({
        content: responseMessage,
      });
    } catch (error) {
      console.error("❌ Error in removeusers command:", error);
      await interaction.editReply({
        content:
          "❌ An error occurred while processing the command. Please check the message ID and try again.",
      });
    }
  },
};

