import { Command } from "../../../Model/command";

import { SlashCommandBuilder, PermissionsBitField } from "discord.js";
const { ManageRoles, ManageChannels } = PermissionsBitField.Flags;

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName("mencari")
    .setDescription("Mencari Team")
    .setDefaultMemberPermissions(ManageRoles)
    .setDefaultMemberPermissions(ManageChannels)
};
