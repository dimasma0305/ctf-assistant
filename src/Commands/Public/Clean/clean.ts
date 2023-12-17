import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { Command } from "../../../Model/command";
const { ManageRoles, ManageMessages } = PermissionFlagsBits;

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName("clean")
    .setDescription("Message Cleaner")
    .setDefaultMemberPermissions(ManageRoles)
    .setDefaultMemberPermissions(ManageMessages)
}
