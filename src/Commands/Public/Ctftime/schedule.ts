import { SubCommand } from "../../../Model/command";
import { SlashCommandSubcommandBuilder, TextChannel } from "discord.js";
import { CTFEvent, infoEvent } from "../../../Functions/ctftime-v2";
import { ReactionRoleEvent } from "./utils/event";
import { createRoleIfNotExist } from "./utils/event";

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
    if (!(channel instanceof TextChannel)) return

    await interaction.deferReply({ flags: ["Ephemeral"] })
    const id = options.getString("id", true);
    const is_dummie = options.getBoolean("is_dummie");
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
        finish: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        format: "placeholder",
        format_id: 0,
        id: 0,
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
        title: id,
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

    const event = new ReactionRoleEvent(guild, channel, {
      ctfEvent: ctfEvent,
      notificationRole: await createRoleIfNotExist({
        name: "CTF Waiting Role",
        guild: guild,
        color: "#87CEEB"
      }),
      author: interaction.user
    })

    await event.addEvent()
    await event.createMessageForRole()

    await interaction.editReply({
      content: "Success",
    })
  },
};
