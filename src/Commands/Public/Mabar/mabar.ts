import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { Command } from "../../../Model/command";
const { ManageChannels, Administrator } = PermissionFlagsBits;

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName("mabar")
    .setDescription("Manage CTF mabar notification channels")
    .setDefaultMemberPermissions(ManageChannels | Administrator)
}

