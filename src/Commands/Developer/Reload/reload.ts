import { Command } from "../../../Model/command";

const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName("reload")
    .setDescription("Reload your commands/events.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
};
