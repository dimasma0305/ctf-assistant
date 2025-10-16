import { PermissionFlagsBits } from "discord.js";
import { Command } from "../../../Model/command";
import { SlashCommandBuilder } from "discord.js";
const { ManageChannels } = PermissionFlagsBits;
export const command: Command =  {
  data: new SlashCommandBuilder()
    .setName("logger")
    .setDescription("Generate ctf log")
    .setDefaultMemberPermissions(ManageChannels)
};
