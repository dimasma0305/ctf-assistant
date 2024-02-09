import { SubCommand } from "../../../Model/command";
import { SlashCommandSubcommandBuilder } from "discord.js";
import { infoEvent } from "../../../Functions/ctftime-v2";
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

    await interaction.deferReply({ ephemeral: true })
    const id = options.getString("id", true);
    const ctf_event = await infoEvent(id);
    const isPrivate = options.getBoolean("private") || false;
    const password = options.getString("password") || "";


    if (isPrivate) {
      if (!password) {
        throw new Error("Password not provided");
      }
    }


    const event = new ReactionRoleEvent(interaction, {
      ctfName: ctf_event.title,
      days: ctf_event.duration.days,
      hours: ctf_event.duration.hours,
      isPrivate,
      password
    })

    const message = await interaction.channel.send({
      embeds: [{
        title: `${ctf_event.title}${isPrivate ? " **(PRIVATE)**" : ""}`,
        description: ctf_event.ctftime_url,
        url: `https://ctftime.org/event/${id}`,
        thumbnail: {
          url: ctf_event.logo,
        },
        fields: [
          { name: "**ID**", value: id, inline: true },
          { name: "**Format**", value: ctf_event.format, inline: true },
          { name: "**Location**", value: ctf_event.location, inline: false },
          { name: "**Weight**", value: ctf_event.weight.toString(), inline: true },
        ],
        footer: {
          text: `${ctf_event.start} - ${ctf_event.finish}`,
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
