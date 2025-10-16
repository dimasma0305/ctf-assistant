import { EventModel } from "../../../Database/connect";
import { SubCommand } from "../../../Model/command";
import { SlashCommandSubcommandBuilder } from "discord.js";

const PUBLIC_URL = process.env.PUBLIC_URL || "https://assistant.1pc.tf/"

export const command: SubCommand = {
  data: new SlashCommandSubcommandBuilder()
    .setName("gen")
    .setDescription("Generate ctf event form link"),
  async execute(interaction, client) {
    const channel = interaction.channel
    const guild = interaction.guild
    if (!channel || !guild) return

    await interaction.deferReply({ flags: ["Ephemeral"] })
    const event  = new EventModel()
    const id = (await event.save()).id
    await interaction.editReply({content: PUBLIC_URL + "/event/" + id})
  },
};
