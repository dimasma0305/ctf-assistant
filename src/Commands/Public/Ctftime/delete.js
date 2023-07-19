const {
    ChatInputCommandInteraction,
    Client,
    SlashCommandSubcommandBuilder,
} = require("discord.js");

const {translate} = require("../../../Functions/discord-utils")
const { infoEvents } = require("../../../Functions/ctftime");

module.exports = {
    subCommand: "ctftime.delete",
    data: new SlashCommandSubcommandBuilder()
        .setName('delete')
        .setDescription('delete all role and channel associate with ctf event')
        .addStringOption((option) => option
            .setName("id")
            .setDescription("id of the ctf event on ctftime")
            .setRequired(true)
        ),
    /**
     *
     * @param {ChatInputCommandInteraction} interaction
     * @param {Client} _client
     */
    async execute(interaction, _client) {
        const { options } = interaction;
        await interaction.deferReply({ ephemeral: true });
        try {
            const id = options.getString("id");
            const data = await infoEvents(id);
            if (data.length === 0) {
                return interaction.editReply({
                    content: "Invalid id CTFs",
                    ephemeral: true,
                });
            }
            interaction.guild.roles.cache.forEach(async (role) => {
                console.log(role.name, data.title)
                if (role.name === data.title) {
                    await role.delete()
                    return true
                }
            });
            interaction.guild.channels.cache.forEach((channel) => {
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
                ephemeral: true
            })
        } catch (error) {
            console.error(error)
            await interaction.editReply({
                content: error.toString(),
                ephemeral: true
            })
        }
    },
};
