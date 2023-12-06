import { SlashCommandSubcommandBuilder } from "discord.js";
import { SubCommand } from "../../../Model/command";

const { loadCommands } = require("../../../Handlers/commandHandler");

export const command: SubCommand = {
  data: new SlashCommandSubcommandBuilder()
    .setName("events").setDescription("Reload your events"),
  execute(interaction, client) {
    loadCommands(client);
    interaction.reply({
      content: "Reloaded Commands",
      ephemeral: true
    });
  },
};
