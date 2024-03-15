import { SubCommand } from "../../../Model/command";
import { SlashCommandSubcommandBuilder } from "discord.js";
import { infoEvent } from "../../../Functions/ctftime-v2";
import { ReactionRoleEvent } from "./utils/event";
import { createRoleIfNotExist } from "./utils/event_utility";
import { scheduleEmbedTemplate } from "./utils/template";

export const command: SubCommand = {
  data: new SlashCommandSubcommandBuilder()
    .setName("schedule")
    .setDescription("Schedule CTFs")
    .addStringOption(option => option
      .setName("id")
      .setDescription("CTFs ID")
      .setRequired(true)
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
    const guild = interaction.guild
    if (!channel || !guild) return

    await interaction.deferReply({ ephemeral: true })
    const id = options.getString("id", true);
    const ctfEvent = await infoEvent(id);
    const isPrivate = options.getBoolean("private") || false;
    const password = options.getString("password") || "";


    if (isPrivate) {
      if (!password) {
        throw new Error("Password not provided");
      }
    }

    const event = new ReactionRoleEvent(interaction, {
      ctfEvent: ctfEvent,
      isPrivate,
      password,
      notificationRole: await createRoleIfNotExist({
        name: "CTF Waiting Role",
        guild: guild,
        color: "#87CEEB"
      })
    })

    const message = await interaction.channel.send({
      embeds: [scheduleEmbedTemplate({ctf_event: ctfEvent,isPrivate})],
    });

    await message.react("✅");
    event.addEventListener(message)

    interaction.editReply({
      content: "Success",
    })
  },
};
