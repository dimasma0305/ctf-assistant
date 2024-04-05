import { APIEmbed, JSONEncodable } from "discord.js";
import { SubCommand } from "../../../Model/command";

import { SlashCommandSubcommandBuilder } from "discord.js";
import { getUpcommingOnlineEvent, infoEvent } from "../../../Functions/ctftime-v2";
import { scheduleEmbedTemplate } from "./utils/template";

export const command: SubCommand = {
  data: new SlashCommandSubcommandBuilder()
    .setName("upcoming")
    .setDescription("Display upcoming CTFs")
    .addIntegerOption((input) => input
      .setName("days")
      .setDescription("Check until n days")
      .setMinValue(1)
      .setMaxValue(100)
      .setRequired(false)
    ),
  async execute(interaction, _client) {
    const { options } = interaction;
    const days = options.getInteger("days") || 5

    const event = await getUpcommingOnlineEvent(days);
    const embedsSend: Array<APIEmbed | JSONEncodable<APIEmbed>> = [];

    await interaction.deferReply({ ephemeral: true })
    for (let i = 0; i < event.length; i++) {
      const data = event[i];
      embedsSend.push(scheduleEmbedTemplate({
        ctfEvent: data,
        isPrivate: false
      }));
    }
    await interaction.deleteReply()
    return interaction.channel?.send({ embeds: embedsSend });
  },
};
