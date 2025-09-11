import { SubCommand } from "../../../Model/command";
import { SlashCommandSubcommandBuilder, TextChannel } from "discord.js";
import { translate } from "../../../Functions/discord-utils";
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
    allowedRoles: ["Mabar Manager"],
    async execute(interaction, _client) {
        const { options } = interaction;
        await interaction.deferReply({ flags: ["Ephemeral"] })
        var title: string | null = null
        const id = options.getString("id", false);
        if (id){
            const data = await infoEvent(id);
            title = data.title
        } else {
            title = options.getString("title", false)
        }

        if (!title) {
            const channel = interaction.channel
            if (!channel || !(channel instanceof TextChannel)) {
                await interaction.editReply({
                    content: "Can't get title from channel",
                })
                return
            }
            const topicContent = channel.topic || "{}";
            try {
                const data = JSON.parse(topicContent);
                if (typeof data === 'object' && data !== null && 'title' in data && typeof data.title === 'string') {
                    title = data.title;
                } else {
                    const info = await infoEvent(data.id)
                    title = info.title
                }
            } catch (e) {
                console.error("Failed to parse channel topic as JSON:", e);
            }
            if (!title) {
                await interaction.editReply({
                    content: "Can't get title from channel",
                })
                return
            }
        }

        // At this point, title is guaranteed to be a string
        const ctfTitle: string = title;

        const guild = await interaction.guild?.fetch()
        if (!guild) {
            await interaction.editReply({
                content: "Guild not found",
            })
            return
        }
        guild.roles.cache.forEach(async (role) => {
            if (role.name === ctfTitle) {
                await role.delete()
                return true
            }
        });
        guild.channels.cache.forEach((channel) => {
            const chat_channel = translate(ctfTitle)
            const writeup_channel = translate(`${chat_channel} writeup`)
            if (channel.name === chat_channel ||
                channel.name === writeup_channel) {
                channel.delete()
                return true
            }
        })
        guild.scheduledEvents.cache.forEach((event)=>{
            if (!(event.name.trim()==ctfTitle.trim())) return
            event.delete()
        })
        await interaction.editReply({
            content: `Successfully deleted ${ctfTitle}`,
        })
    },
};
