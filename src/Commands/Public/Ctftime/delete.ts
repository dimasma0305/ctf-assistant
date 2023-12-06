import { SubCommand } from "../../../Model/command";
import { SlashCommandSubcommandBuilder } from "discord.js";
import { translate } from "../../../Functions/discord-utils";
import { infoEvents } from "../../../Functions/ctftime";

export const command: SubCommand = {
    data: new SlashCommandSubcommandBuilder()
        .setName('delete')
        .setDescription('delete all role and channel associate with ctf event')
        .addStringOption((option) => option
            .setName("id")
            .setDescription("id of the ctf event on ctftime")
            .setRequired(true)
        ),
    async execute(interaction, _client) {
        const { options } = interaction;
        await interaction.deferReply({ ephemeral: true });
        try {
            const id = options.getString("id", true);
            const data = await infoEvents(id);
            const guild = interaction.guild
            if (!guild){
                return
            }
            guild.roles.cache.forEach(async (role) => {
                if (role.name === data.title) {
                    await role.delete()
                    return true
                }
            });
            guild.channels.cache.forEach((channel) => {
                const chat_channel = translate(data.title)
                const writeup_channel = translate(`${chat_channel} writeup`)
                if (channel.name === chat_channel ||
                    channel.name === writeup_channel) {
                    channel.delete()
                    return true
                }
            })
            await interaction.editReply({
                content: `Successfuly delete ${data.title}`,
            })
        } catch (error) {
            await interaction.editReply({
                content: error.toString(),
            })
        }
    },
};
