import { ChatInputCommandInteraction } from "discord.js";
import { MyClient } from "../../Model/client";

module.exports = {
  name: "interactionCreate",
  async execute(interaction: ChatInputCommandInteraction, client: MyClient) {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) {
      return interaction.reply({
        content: "This command is outdated",
        ephemeral: true,
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
          ephemeral: true,
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
        interaction.reply({ content: error?.toString(), ephemeral: false })
      }
    } else {
      interaction.reply({ content: "isn't a command", ephemeral: true })
    }
  },
};
