const { ChatInputCommandInteraction, Client, SlashCommandSubcommandBuilder } = require("discord.js");
const { getEvents, infoEvents } = require("../../../Functions/ctftime");

module.exports = {
  subCommand: "ctftime.current",
  data: new SlashCommandSubcommandBuilder()
    .setName("current")
    .setDescription("Display current CTFs"),
  /**
   *
   * @param {ChatInputCommandInteraction} interaction
   * @param {Client} client
   */
  async execute(interaction, client) {
    const time = "now=true";
    const event = await getEvents(time);
    const embedsSend = [];

    if (event.length === 0) {
      return interaction.reply({
        content: "Can't get current CTFs",
        ephemeral: true,
      });
    }

    await interaction.deferReply();
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
