import { SlashCommandSubcommandBuilder } from "discord.js";
import { SubCommand } from "../../../Model/command";
import { loadEvents } from "../../../Handlers/eventHandler";

export const command: SubCommand = {
  data: new SlashCommandSubcommandBuilder()
    .setName("commands").setDescription("Reload your commands"),
  async execute(interaction, client) {
    await interaction.deferReply({ flags: ["Ephemeral"] });
    for (const [key, value] of client.events) {
      client.removeListener(`${key}`, value);
    }
    await loadEvents(client);
    await interaction.editReply({ content: "Reloaded Events" });
  },
};
