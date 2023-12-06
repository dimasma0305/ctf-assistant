import { ChatInputCommandInteraction, Client } from "discord.js";
import { MyClient } from "../../Model/client";

module.exports = {
  name: "interactionCreate",
  execute(interaction: ChatInputCommandInteraction, client: MyClient) {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) {
      return interaction.reply({
        content: "This command is outdated",
        ephemeral: true,
      });
    }

    if (command.developer && interaction.user.id !== "663394727688798231") {
      return interaction.reply({
        content: "This command is only available to the developers",
        ephemeral: true,
      });
    }

    const subCommand = interaction.options.getSubcommand(false);
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
      subCommandFile.execute(interaction, client);
    } else {
      command.execute(interaction, client);
    }
  },
};
