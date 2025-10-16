import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { Command } from "../../../Model/command";
const { ManageRoles } = PermissionFlagsBits;

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName("ctfevent")
    .setDescription("CTF Event Manager")
    .setDefaultMemberPermissions(ManageRoles)
}
