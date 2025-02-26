import { ChatInputCommandInteraction, TextChannel } from "discord.js";
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
    if (!(interaction.channel instanceof TextChannel)) return

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
        await interaction.channel?.send({ content: error?.toString() })
      }
    } else {
      interaction.reply({ content: "isn't a command", flags: ["Ephemeral"] })
    }
  },
};
