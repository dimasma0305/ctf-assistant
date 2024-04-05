import { SubCommand } from "../../../Model/command";
import { SlashCommandSubcommandBuilder } from "discord.js";
import { translate } from "../../../Functions/discord-utils";
import { infoEvents } from "../../../Functions/ctftime";
import { infoEvent } from "../../../Functions/ctftime-v2";

export const command: SubCommand = {
    data: new SlashCommandSubcommandBuilder()
        .setName('delete')
        .setDescription('delete all role and channel associate with ctf event')
        .addStringOption((option) => option
            .setName("id")
            .setDescription("id of the ctf event on ctftime")
            .setRequired(false)
        )
        .addStringOption((option)=> option
            .setName("title")
            .setDescription("Delete ctf by title")
            .setRequired(false)
    ),
    async execute(interaction, _client) {
        const { options } = interaction;
        await interaction.deferReply({ ephemeral: true })
        var title: string
        const id = options.getString("id", false);
        if (id){
            const data = await infoEvent(id);
            title = data.title
        } else {
            title = options.getString("title", true)
        }

        const guild = interaction.guild
        if (!guild) {
            return
        }
        guild.roles.cache.forEach(async (role) => {
            if (role.name === title) {
                await role.delete()
                return true
            }
        });
        guild.channels.cache.forEach((channel) => {
            const chat_channel = translate(title)
            const writeup_channel = translate(`${chat_channel} writeup`)
            if (channel.name === chat_channel ||
                channel.name === writeup_channel) {
                channel.delete()
                return true
            }
        })
        guild.scheduledEvents.cache.forEach((event)=>{
            if (!(event.name==title)) return
            event.delete()
        })
        await interaction.editReply({
            content: `Successfuly delete ${title}`,
        })
    },
};
