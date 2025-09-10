import { Command } from "../../../Model/command";

import { SlashCommandBuilder } from "discord.js";

export const command: Command = {
  data: new SlashCommandBuilder()
  .setName("solve")
  .setDescription("Manage CTF challenge solutions and initialization"),
};


