import { SlashCommandSubcommandBuilder } from "discord.js";
import { infoEvents } from "../../../Functions/ctftime";
import { SubCommand } from "../../../Model/command";

export const command: SubCommand = {
  data: new SlashCommandSubcommandBuilder().setName("ctftime")
    .setDescription("Generate ctf log based on ctftime event id")
    .addStringOption((option) =>
      option.setName("id").setDescription("id CTFs")
    )
    .addStringOption((option) =>
      option.setName("writeup").setDescription("Writeup link")
    )
    .addStringOption((option) =>
      option.setName("leaderboard").setDescription("Leader board ranking")
    ),
  async execute(interaction, _client) {
    const { options } = interaction;

    const id = options.getString("id", true)
    const writeup = options.getString("writeup", true)
    const leaderboard = options.getString("leaderboard", true)

    const data = await infoEvents(id);

    if (!data) {
      return interaction.reply({
        content: "Invalid CTF ID",
        ephemeral: true,
      });
    }

    // get role id
    let roleId = interaction.guild?.roles.cache.find((role) => role.name === data.title)?.id;

    if (!roleId) {
      return interaction.reply({
        content: "The role for this CTF doesn't exist",
        ephemeral: true,
      });
    }

    let membersWithRoleId = (await interaction.guild?.members.fetch())
      .filter((member) => member.roles.cache.find((a) => a.id == roleId))
      .map((m) => `<@${m.id}>`);

    const embed = {
      title: data.title,
      description: data.link,
      url: `https://ctftime.org/event/${id}`,
      thumbnail: {
        url: data.img,
      },
      fields: [
        { name: "**id**", value: id, inline: true },
        { name: "**format**", value: data.format, inline: true },
        { name: "**location**", value: data.location, inline: true },
        { name: "**weight**", value: data.weight, inline: true },
        { name: "**writeup**", value: writeup, inline: true },
        { name: "**leaderboard**", value: leaderboard, inline: true },
        { name: "**participant**", value: membersWithRoleId.join("\n"), inline: false },
      ],
      footer: {
        text: data.date,
      },
    };

    return interaction.editReply({ embeds: [embed] });
  },
};
