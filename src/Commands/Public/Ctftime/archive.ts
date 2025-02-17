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
      .setDescription("CTFs ID")
      .setRequired(true)
    ),
  async execute(interaction, _client) {
    const { options } = interaction;
    const channel = interaction.channel
    const guild = interaction.guild
    if (!channel || !guild) return
    if (!(channel instanceof TextChannel)) return

    await interaction.deferReply({ ephemeral: true })
    const id = options.getString("id", true);
    let ctfEvent = await infoEvent(id)
    const event = new ReactionRoleEvent(guild, channel,{
      ctfEvent: ctfEvent,
    })
    await event.archive()
    await interaction.editReply({
      content: "Success",
    })
  },
};
