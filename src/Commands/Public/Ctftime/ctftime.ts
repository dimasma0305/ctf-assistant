import { Command } from "../../../Model/command";

import { SlashCommandBuilder, PermissionsBitField } from "discord.js";

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName("ctftime")
    .setDescription("CTF event management - display, schedule, and manage CTFs")
};