import { SubCommand } from "../../../Model/command";
import { SlashCommandSubcommandBuilder } from "discord.js";
import { createCTFTimeHelpEmbed } from "./utils/helpEmbed";

export const command: SubCommand = {
  data: new SlashCommandSubcommandBuilder()
    .setName("help")
    .setDescription("Show help information for all ctftime commands"),
  async execute(interaction, _client) {
    const helpEmbed = createCTFTimeHelpEmbed();

    await interaction.reply({ 
      embeds: [helpEmbed],
      flags: ["Ephemeral"]
    });
  },
};
