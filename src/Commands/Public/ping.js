import { SlashCommandBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("ping")
  .setDescription("will response pong");
export function execute(interactin) {
  interactin.reply({ content: "pong", ephemeral: true });
}
