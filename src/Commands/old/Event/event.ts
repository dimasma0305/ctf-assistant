import { Command } from "../../../Model/command";

import { SlashCommandBuilder, PermissionsBitField } from "discord.js";
const { ManageEvents } = PermissionsBitField.Flags;

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName("event")
    .setDescription("Create CTF event")
    .setDefaultMemberPermissions(ManageEvents)
};


