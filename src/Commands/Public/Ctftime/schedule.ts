import { SubCommand } from "../../../Model/command";
import { SlashCommandSubcommandBuilder } from "discord.js";
import { CTFEvent, infoEvent } from "../../../Functions/ctftime-v2";
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
      .setName("is_dummie")
      .setDescription("Is CTF dummy?")
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
    const is_dummie = options.getBoolean("is_dummie");
    console.log("is_dummie", is_dummie)
    let ctfEvent: CTFEvent;
    if (is_dummie) {
      ctfEvent = {
        ctf_id: parseInt(id),
        ctftime_url: "placeholder",
        description: "placeholder",
        duration: {
          days: 2,
          hours: 2 * 24,
        },
        finish: new Date(Date.now() + 2 * 24 * 60 * 1000),
        format: "placeholder",
        format_id: 0,
        id: parseInt(id),
        is_votable_now: false,
        live_feed: "placeholder",
        location: "placeholder",
        logo: "https://avatars.githubusercontent.com/u/109392350",
        onsite: false,
        organizers: [{ id: 0, name: "placeholder" }],
        participants: 0,
        public_votable: false,
        restrictions: "placeholder",
        start: new Date(Date.now()),
        title: "dummy_" + id,
        url: "placeholder",
        weight: 0
      }
    } else {
      ctfEvent = await infoEvent(id)
    }
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
      embeds: [scheduleEmbedTemplate({ ctf_event: ctfEvent, isPrivate })],
    });

    await message.react("✅");
    event.addEventListener(message)

    interaction.editReply({
      content: "Success",
    })
  },
};
