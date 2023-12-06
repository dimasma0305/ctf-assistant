import { SlashCommandBuilder, PermissionsBitField } from "discord.js";
import { Command } from "../../../Model/command";

const { Administrator } = PermissionsBitField.Flags;

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName("send")
    .setDescription("Send message to the server")
    .setDefaultMemberPermissions(Administrator),
}
