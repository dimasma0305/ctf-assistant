import { Command } from "../../../Model/command";
import { SlashCommandBuilder, PermissionsBitField } from "discord.js";

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName("trakteer")
    .setDescription("Trakteer integration - configure and manage Trakteer updates")
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
};

