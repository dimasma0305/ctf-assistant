import { SubCommand } from "../../../Model/command";
import { SlashCommandSubcommandBuilder, TextChannel } from "discord.js";
import { infoEvent } from "../../../Functions/ctftime-v2";
import { ReactionRoleEvent } from "./utils/event";

export const command: SubCommand = {
  data: new SlashCommandSubcommandBuilder()
    .setName("archive")
    .setDescription("archive CTFs")
    .addStringOption(option => option
      .setName("id")
      .setDescription("CTFs ID")
      .setRequired(true)
    ),
  allowedRoles: ["Mabar Manager"],
  async execute(interaction, _client) {
    const { options } = interaction;
    const channel = interaction.channel
    const guild = interaction.guild
    if (!channel || !guild) return
    if (!(channel instanceof TextChannel)) return
    await interaction.deferReply({ flags: ["Ephemeral"] })

    const id = options.getString("id", true);
    let ctfEvent = await infoEvent(id, false)
    const event = new ReactionRoleEvent(guild, channel,{
      ctfEvent: ctfEvent,
    })
    await event.archive()
    await interaction.editReply({
      content: "Success",
    })
  },
};

