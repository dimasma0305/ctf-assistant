import { ChatInputCommandInteraction, TextChannel, ThreadChannel } from "discord.js";
import { Event } from "../../Handlers/eventHandler";
import { MyClient } from "../../Model/client";

export const event: Event = {
  name: "interactionCreate",
  async execute(interaction: ChatInputCommandInteraction, client: MyClient) {
    if (!interaction.isChatInputCommand()) return;
    const command = client.commands.get(interaction.commandName);
    if (!command) {
      return interaction.reply({
        content: "This command is outdated",
        flags: ["Ephemeral"]
      });
    }
    if (!(interaction.channel instanceof TextChannel) || !(interaction.channel.isThread())) {
      console.log(interaction.channel?.type)
      console.log(interaction.channel)
      return interaction.reply({
        content: "This command can only be used in a text channel or a thread.",
        flags: ["Ephemeral"]
      });
    }

    const subCommand = interaction.options.getSubcommand(false);
    let execute;
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
      execute = subCommandFile.execute
    } else {
      execute = command.execute
    }
    if (execute) {
      try {
        await execute(interaction, client)
      } catch (error) {
        console.log(error)
        await interaction.reply({ content: error?.toString() })
      }
    } else {
      interaction.reply({ content: "isn't a command", flags: ["Ephemeral"] })
    }
  },
};
