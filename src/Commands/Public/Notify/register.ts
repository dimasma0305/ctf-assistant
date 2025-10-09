import { SubCommand } from "../../../Model/command";
import { SlashCommandSubcommandBuilder, TextChannel, ChannelType } from "discord.js";
import { GuildChannelModel } from "../../../Database/connect";

export const command: SubCommand = {
  data: new SlashCommandSubcommandBuilder()
    .setName("register")
    .setDescription("Register the current channel to receive CTF notifications")
    .addChannelOption(option => option
      .setName("channel")
      .setDescription("The channel to register (defaults to current channel)")
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(false)
    )
    .addStringOption(option => option
      .setName("event_type")
      .setDescription("Type of event notifications (defaults to weekly_reminder)")
      .addChoices(
        { name: "Weekly Reminders", value: "weekly_reminder" },
        { name: "CTF Announcements", value: "ctf_announcement" },
        { name: "Solve Updates", value: "solve_update" },
        { name: "Event Created", value: "event_created" },
        { name: "All Events", value: "all" }
      )
      .setRequired(false)
    ),
  allowedRoles: ["Mabar Manager"],
  async execute(interaction, _client) {
    const { options, guild, channel: currentChannel, user } = interaction;
    
    if (!guild) {
      await interaction.reply({ 
        content: "❌ This command can only be used in a server!", 
        flags: ["Ephemeral"] 
      });
      return;
    }

    await interaction.deferReply({ flags: ["Ephemeral"] });

    // Get the channel to register (either specified or current channel)
    const targetChannel = options.getChannel("channel") || currentChannel;
    
    if (!targetChannel || !(targetChannel instanceof TextChannel)) {
      await interaction.editReply({
        content: "❌ Please specify a valid text channel!"
      });
      return;
    }

    // Get event type preference
    const eventTypeOption = options.getString("event_type") || "weekly_reminder";
    const eventTypes = eventTypeOption === "all" 
      ? ["weekly_reminder", "ctf_announcement", "solve_update", "event_created"]
      : [eventTypeOption];

    try {
      // Check if already registered
      const existingRegistration = await GuildChannelModel.findOne({
        guild_id: guild.id,
        channel_id: targetChannel.id
      });

      if (existingRegistration) {
        if (existingRegistration.is_active) {
          // Update event types if different
          const existingTypes = existingRegistration.event_types || ["weekly_reminder"];
          const newTypesSet = new Set([...existingTypes, ...eventTypes]);
          const updatedTypes = Array.from(newTypesSet);
          
          existingRegistration.event_types = updatedTypes;
          existingRegistration.updated_at = new Date();
          await existingRegistration.save();
          
          const eventTypesList = updatedTypes.map(t => `• ${t.replace(/_/g, ' ')}`).join('\n');
          
          await interaction.editReply({
            content: `✅ Updated ${targetChannel} event subscriptions!\n\n` +
                     `📢 Subscribed to:\n${eventTypesList}`
          });
        } else {
          // Reactivate the registration
          existingRegistration.is_active = true;
          existingRegistration.event_types = eventTypes;
          existingRegistration.updated_at = new Date();
          await existingRegistration.save();
          
          const eventTypesList = eventTypes.map(t => `• ${t.replace(/_/g, ' ')}`).join('\n');
          
          await interaction.editReply({
            content: `✅ Channel ${targetChannel} has been re-activated for CTF notifications!\n\n` +
                     `📢 Subscribed to:\n${eventTypesList}`
          });
        }
        return;
      }

      // Create new registration
      const newRegistration = new GuildChannelModel({
        guild_id: guild.id,
        channel_id: targetChannel.id,
        guild_name: guild.name,
        channel_name: targetChannel.name,
        is_active: true,
        registered_by: user.id,
        event_types: eventTypes
      });

      await newRegistration.save();

      const eventTypesList = eventTypes.map(t => `• ${t.replace(/_/g, ' ')}`).join('\n');
      const eventDescription = eventTypes.includes("weekly_reminder") 
        ? `\n\n📅 Weekly reminders will be sent every Friday at 8 AM (SGT)` 
        : '';

      await interaction.editReply({
        content: `✅ Successfully registered ${targetChannel} to receive CTF notifications!\n\n` +
                 `📢 Subscribed to:\n${eventTypesList}${eventDescription}`
      });

      console.log(`📢 Channel registered: ${guild.name} / ${targetChannel.name} by ${user.tag} (${eventTypes.join(', ')})`);
    } catch (error) {
      console.error("❌ Error registering channel:", error);
      await interaction.editReply({
        content: "❌ An error occurred while registering the channel. Please try again later."
      });
    }
  },
};

