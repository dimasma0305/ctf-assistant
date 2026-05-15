import { SlashCommandSubcommandBuilder } from "discord.js";
import { SubCommand } from "../../../Model/command";

const { loadCommands } = require("../../../Handlers/commandHandler");

export const command: SubCommand = {
  data: new SlashCommandSubcommandBuilder()
    .setName("events").setDescription("Reload your events"),
  async execute(interaction, client) {
    await interaction.deferReply({ flags: ["Ephemeral"] });
    await loadCommands(client);
    await interaction.editReply({ content: "Reloaded Commands" });
  },
};
