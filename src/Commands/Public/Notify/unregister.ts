import { SubCommand } from "../../../Model/command";
import { SlashCommandSubcommandBuilder, TextChannel, ChannelType } from "discord.js";
import { GuildChannelModel } from "../../../Database/connect";

export const command: SubCommand = {
  data: new SlashCommandSubcommandBuilder()
    .setName("unregister")
    .setDescription("Unregister a channel from receiving CTF notifications")
    .addChannelOption(option => option
      .setName("channel")
      .setDescription("The channel to unregister (defaults to current channel)")
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(false)
    ),
  allowedRoles: ["Mabar Manager"],
  async execute(interaction, _client) {
    const { options, guild, channel: currentChannel } = interaction;
    
    if (!guild) {
      await interaction.reply({ 
        content: "❌ This command can only be used in a server!", 
        flags: ["Ephemeral"] 
      });
      return;
    }

    await interaction.deferReply({ flags: ["Ephemeral"] });

    // Get the channel to unregister (either specified or current channel)
    const targetChannel = options.getChannel("channel") || currentChannel;
    
    if (!targetChannel || !(targetChannel instanceof TextChannel)) {
      await interaction.editReply({
        content: "❌ Please specify a valid text channel!"
      });
      return;
    }

    try {
      // Find the registration
      const registration = await GuildChannelModel.findOne({
        guild_id: guild.id,
        channel_id: targetChannel.id
      });

      if (!registration) {
        await interaction.editReply({
          content: `⚠️ Channel ${targetChannel} is not registered for notifications!`
        });
        return;
      }

      if (!registration.is_active) {
        await interaction.editReply({
          content: `⚠️ Channel ${targetChannel} is already inactive!`
        });
        return;
      }

      // Deactivate the registration (soft delete)
      registration.is_active = false;
      registration.updated_at = new Date();
      await registration.save();

      await interaction.editReply({
        content: `✅ Successfully unregistered ${targetChannel} from CTF notifications!\n\n` +
                 `This channel will no longer receive automated CTF updates.`
      });

      console.log(`🔕 Channel unregistered: ${guild.name} / ${targetChannel.name}`);
    } catch (error) {
      console.error("❌ Error unregistering channel:", error);
      await interaction.editReply({
        content: "❌ An error occurred while unregistering the channel. Please try again later."
      });
    }
  },
};

