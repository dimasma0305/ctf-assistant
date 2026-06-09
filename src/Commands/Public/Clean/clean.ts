import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { Command } from "../../../Model/command";
const { ManageRoles, ManageMessages } = PermissionFlagsBits;

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName("clean")
    .setDescription("Message Cleaner")
    // Combine flags in ONE call — setDefaultMemberPermissions is a setter, so the
    // two separate calls dropped ManageRoles and required only ManageMessages
    // (2026-06-09 audit fix).
    .setDefaultMemberPermissions(ManageRoles | ManageMessages)
}
