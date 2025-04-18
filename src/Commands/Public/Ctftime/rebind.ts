import { SubCommand } from "../../../Model/command";
import { SlashCommandSubcommandBuilder, Message, ButtonStyle, ButtonBuilder, ActionRowBuilder, ComponentType, ActionRowData, JSONEncodable, APIActionRowComponent, APIMessageActionRowComponent, TextChannel, NewsChannel, DMChannel } from "discord.js";
import { CTFEvent, infoEvent } from "../../../Functions/ctftime-v2";
import { ReactionRoleEvent } from "./utils/event";

export const command: SubCommand = {
  data: new SlashCommandSubcommandBuilder()
    .setName('rebind')
    .setDescription('Flush role from embed event message')
    .addStringOption((option) => option
      .setName("id")
      .setDescription("event id")
      .setRequired(true)
    ).addBooleanOption(option => option
      .setName("is_dummie")
      .setDescription("Is CTF dummy?")
    ).addNumberOption(option => option
      .setName("day")
      .setDescription("Set closure time (default: 1 day)")
    ),
  async execute(interaction, _client) {
    const { options } = interaction;
    const guild = await interaction.guild?.fetch()
    const channel = interaction.channel
    if (!guild) throw Error("guild not found!")
    if (!channel) throw Error("channel not found!")
    if (!(channel instanceof TextChannel)) throw Error("channel isn't text based channel!")

    const id = options.getString("id", true);
    const is_dummie = options.getBoolean("is_dummie");
    let ctfEvent: CTFEvent;
    if (is_dummie) {
      ctfEvent = {
        ctf_id: 0,
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

    await interaction.deferReply({ flags: ["Ephemeral"] })

    const event = new ReactionRoleEvent(guild, channel, { ctfEvent })
    await event.createMessageForRole()

    return interaction.followUp({
      content: "The role has been added to all users who reacted with a white check mark.",
      flags: ["Ephemeral"]
    })
  },
};
