import { SubCommand } from "../../../Model/command";
import { SlashCommandSubcommandBuilder } from "discord.js";

export const command: SubCommand = {
  data: new SlashCommandSubcommandBuilder()
    .setName("poster")
    .setDescription("Menampilkan poster"),
  async execute(interaction, _client) {
  },
};
