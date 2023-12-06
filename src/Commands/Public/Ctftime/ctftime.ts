import { Command } from "../../../Model/command";

const { SlashCommandBuilder, PermissionsBitField } = require("discord.js");
const { ManageRoles, ManageChannels } = PermissionsBitField.Flags;

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName("ctftime")
    .setDescription("Display upcoming/current CTFs")
    .setDefaultMemberPermissions(ManageRoles)
    .setDefaultMemberPermissions(ManageChannels)
};
