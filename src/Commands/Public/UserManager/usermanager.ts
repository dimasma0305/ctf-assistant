import { Command } from "../../../Model/command";
import { SlashCommandBuilder } from "discord.js";

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName("usermanager")
    .setDescription("Manage users in channels"),
};

