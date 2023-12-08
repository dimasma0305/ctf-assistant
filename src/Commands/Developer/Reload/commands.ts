import { SlashCommandSubcommandBuilder } from "discord.js";
import { SubCommand } from "../../../Model/command";

const { loadCommands } = require("../../../Handlers/commandHandler");

export const command: SubCommand = {
  data: new SlashCommandSubcommandBuilder()
    .setName("events").setDescription("Reload your events"),
  execute(interaction, client) {
    loadCommands(client);
    interaction.editReply({
      content: "Reloaded Commands",
    });
  },
};
