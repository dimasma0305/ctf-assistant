import { Command } from "../../../Model/command";
import { SlashCommandBuilder } from "discord.js";

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName("affection")
    .setDescription("Hackerika's affection toward members"),
};
