import { APIEmbed, JSONEncodable } from "discord.js";
import { SubCommand } from "../../../Model/command";

const { SlashCommandSubcommandBuilder } = require("discord.js");
const { getEvents, infoEvents } = require("../../../Functions/ctftime");

export const command: SubCommand = {
  data: new SlashCommandSubcommandBuilder()
    .setName("upcoming")
    .setDescription("Display upcoming CTFs"),
  async execute(interaction, _client) {
    const time = "upcoming=true";
    const event = await getEvents(time);
    const embedsSend: Array<APIEmbed | JSONEncodable<APIEmbed>> = [];

    for (let i = 0; i < event.length; i++) {
      const data = event[i];
      const eventInfo = await infoEvents(data.id);
      embedsSend.push({
        title: data.name,
        description: eventInfo.link,
        url: `https://ctftime.org/event/${data.id}`,
        thumbnail: {
          url: eventInfo.img,
        },
        fields: [
          { name: "**id**", value: data.id, inline: true },
          { name: "**format**", value: data.format, inline: true },
          { name: "**location**", value: data.location, inline: false },
          { name: "**weight**", value: data.weight, inline: true },
          { name: "**notes**", value: data.notes, inline: true },
        ],
        footer: {
          text: data.date,
        },
      });
    }
    return interaction.editReply({ embeds: embedsSend });
  },
};
