import { SubCommand } from "../../../Model/command";
import { SlashCommandSubcommandBuilder } from "discord.js";
import { infoEvents } from "../../../Functions/ctftime";
import { ReactionRoleEvent } from "./utils/event";

export const command: SubCommand = {
  data: new SlashCommandSubcommandBuilder()
    .setName("schedule")
    .setDescription("Schedule CTFs")
    .addStringOption(option => option
      .setName("id")
      .setDescription("CTFs ID")
      .setRequired(true)
    ).addNumberOption(option => option
      .setName("day")
      .setDescription("Set closure time (default: 1 day)")
    ).addBooleanOption(option => option
      .setName("private")
      .setDescription("Is this a private CTF event?")
    ).addStringOption(option => option
      .setName("password")
      .setDescription("Password for the private CTF event")
    ),
  async execute(interaction, _client) {
    const { options } = interaction;
    const channel = interaction.channel
    if (!channel) return
    const id = options.getString("id", true);
    const day = options.getNumber("day") || 1;
    const isPrivate = options.getBoolean("private") || false;
    const password = options.getString("password") || "";

    if (isPrivate) {
      if (!password) {
        return interaction.reply({
          content: "Password not provided",
          ephemeral: true
        });
      }
    }

    const data = await infoEvents(id);

    const event = new ReactionRoleEvent(interaction, {
      ctfName: data.title,
      day,
      isPrivate,
      password
    })

    const message = await interaction.channel.send({
      embeds: [{
        title: `${data.title}${isPrivate ? " **(PRIVATE)**" : ""}`,
        description: data.link,
        url: `https://ctftime.org/event/${id}`,
        thumbnail: {
          url: data.img,
        },
        fields: [
          { name: "**ID**", value: id, inline: true },
          { name: "**Format**", value: data.format, inline: true },
          { name: "**Location**", value: data.location, inline: false },
          { name: "**Weight**", value: data.weight, inline: true },
        ],
        footer: {
          text: data.date,
        },
      }],
    });

    await message.react("✅");

    event.addEventListener(message)

    interaction.editReply({
      content: "Success",
    })
  },
};
