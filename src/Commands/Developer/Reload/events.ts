import { SlashCommandSubcommandBuilder } from "discord.js";
import { SubCommand } from "../../../Model/command";
import { loadEvents } from "../../../Handlers/eventHandler";

export const command: SubCommand = {
  data: new SlashCommandSubcommandBuilder()
    .setName("commands").setDescription("Reload your commands"),
  execute(interaction, client) {
    for (const [key, value] of client.events) {
      client.removeListener(`${key}`, value);
    }
    loadEvents(client);
    interaction.reply({
      content: "Reloaded Events",
      flags: ["Ephemeral"]
    });
  },
};
