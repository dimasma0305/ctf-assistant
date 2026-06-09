import { ChatInputCommandInteraction, TextChannel, ThreadChannel } from "discord.js";
import { Event } from "../../Handlers/eventHandler";
import { MyClient } from "../../Model/client";

export const event: Event = {
  name: "interactionCreate",
  async execute(interaction: ChatInputCommandInteraction, client: MyClient) {
    const truncateForDiscord = (content: string, maxLength: number = 2000): string => {
      if (content.length <= maxLength) {
        return content;
      }
      const suffix = '\n... (truncated)';
      return `${content.slice(0, Math.max(0, maxLength - suffix.length))}${suffix}`;
    };

    if (!interaction.isChatInputCommand()) return;
    const command = client.commands.get(interaction.commandName);
    if (!command) {
      return interaction.reply({
        content: "This command is outdated",
        flags: ["Ephemeral"]
      });
    }
    if (!interaction.channel?.isTextBased() && !interaction.channel?.isThread()) {
      return interaction.reply({
        content: "This command can only be used in a text channel or a thread.",
        flags: ["Ephemeral"]
      });
    }

    const subCommand = interaction.options.getSubcommand(false);
    let execute;
    let commandToCheck = null;
    
    if (subCommand) {
      const subCommandFile = client.subCommands.get(
        `${interaction.commandName}.${subCommand}`
      );
      if (!subCommandFile) {
        return interaction.reply({
          content: "This Subcommand is outdated",
          flags: ["Ephemeral"],
        });
      }
      execute = subCommandFile.execute;
      commandToCheck = subCommandFile;
    } else {
      execute = command.execute;
      commandToCheck = command;
    }

    // Check allowedRoles if defined
    if (commandToCheck?.allowedRoles && commandToCheck.allowedRoles.length > 0) {
      if (!interaction.member || !interaction.guild) {
        return interaction.reply({
          content: "❌ This command can only be used in a server.",
          flags: ["Ephemeral"]
        });
      }

      const memberRoles = interaction.member.roles;
      const hasRequiredRole = commandToCheck.allowedRoles.some((roleName: string) => {
        if (Array.isArray(memberRoles)) {
          // APIGuildMember - roles is string array
          const guildRoles = interaction.guild!.roles.cache;
          return memberRoles.some((roleId: string) => {
            const role = guildRoles.get(roleId);
            return role && role.name === roleName;
          });
        } else {
          // GuildMember - roles is GuildMemberRoleManager
          return memberRoles.cache.some((role: any) => role.name === roleName);
        }
      });

      if (!hasRequiredRole) {
        const requiredRoles = commandToCheck.allowedRoles.join(', ');
        return interaction.reply({
          content: `❌ You need one of these roles to use this command: **${requiredRoles}**`,
          flags: ["Ephemeral"]
        });
      }
    }
    if (execute) {
      try {
        await execute(interaction, client)
      } catch (error) {
        // Log the full error server-side, but NEVER echo it to Discord — raw
        // error strings leak internal details (DB hosts, file paths, upstream
        // URLs) and, after a public defer, leak them in-channel (2026-06-09
        // audit fix). Reply with a fixed, generic message.
        console.error('[SlashCommand] execution failed:', error)

        const safeErrorMessage = "❌ Something went wrong running that command. Please try again later.";
        try {
          if (interaction.deferred) {
            await interaction.editReply({ content: safeErrorMessage });
          } else if (interaction.replied) {
            await interaction.followUp({ content: safeErrorMessage, flags: ["Ephemeral"] });
          } else {
            await interaction.reply({ content: safeErrorMessage, flags: ["Ephemeral"] });
          }
        } catch (replyError) {
          console.error('Failed to send error response:', replyError);
        }
      }
    } else {
      try {
        await interaction.reply({ content: "This isn't a valid command", flags: ["Ephemeral"] });
      } catch (replyError) {
        console.error('Failed to reply to invalid command:', replyError);
      }
    }
  },
};
