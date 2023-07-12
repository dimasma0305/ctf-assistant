const {
    ChatInputCommandInteraction,
    Client,
    PermissionsBitField,
} = require("discord.js");
const { infoEvents } = require("../../../Functions/ctftime");
const { ManageRoles, ManageChannels } = PermissionsBitField.Flags;

module.exports = {
    subCommand: "ctftime.delete",
    /**
     *
     * @param {ChatInputCommandInteraction} interaction
     * @param {Client} _client
     */
    async execute(interaction, _client) {
        const { options } = interaction;
        const permissionAdmin = [ManageRoles, ManageChannels];
        if (!interaction.member.permissions.has(permissionAdmin)) {
            return interaction.reply({
                content: "This command is only available to the admin",
                ephemeral: true,
            });
        }
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
            await interaction.guild.roles.cache.find((role) => {
                if (role.name === data.title) {
                    role.delete()
                    return true
                }
            });
            await interaction.guild.channels.cache.forEach((channel) => {
                const chat_channel = data.title.toLowerCase().replace(" ", "-")
                const writeup_channel = `${chat_channel} writeup`.toLowerCase().replace(" ", "-")
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
