import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { Command } from "../../../Model/command";
const { ManageChannels, Administrator } = PermissionFlagsBits;

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName("notify")
    .setDescription("Manage CTF notification channels")
    .setDefaultMemberPermissions(ManageChannels | Administrator)
}

