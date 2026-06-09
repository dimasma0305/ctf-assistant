import { Command } from "../../../Model/command";

import { SlashCommandBuilder, PermissionsBitField } from "discord.js";
const { ManageRoles, ManageChannels } = PermissionsBitField.Flags;

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName("mencari")
    .setDescription("Mencari Team")
    // One call — two setter calls dropped ManageRoles (2026-06-09 audit fix).
    .setDefaultMemberPermissions(ManageRoles | ManageChannels)
};
