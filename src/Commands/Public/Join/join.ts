import { Command } from "../../../Model/command";

const { SlashCommandBuilder } = require("discord.js");

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName("join")
    .setDescription("Join CTF")
};
