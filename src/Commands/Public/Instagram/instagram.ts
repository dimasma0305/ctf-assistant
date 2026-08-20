import { Command } from "../../../Model/command";
import { SlashCommandBuilder } from "discord.js";

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName("instagram")
    .setDescription("Manage Instagram profile update monitors for this server"),
};
