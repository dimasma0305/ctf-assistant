const {
    ChatInputCommandInteraction,
    Client,
    PermissionsBitField,
    ChannelType,
} = require("discord.js");
const { infoEvents } = require("../../../Functions/ctftime");
const { ManageRoles, ManageChannels, SendMessages, ViewChannel } = PermissionsBitField.Flags;

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
        try {
            const id = options.getString("id");
            const data = await infoEvents(id);

            if (data.length === 0) {
                return interaction.reply({
                    content: "Invalid id CTFs",
                    ephemeral: true,
                });
            }
            await interaction.guild.roles.delete({
                name: data.title,
            });
            await interaction.guild.channels.delete({
                name: data.title,
            });
            await interaction.guild.channels.delete({
                name: `${data.title} writeup`,
            });
        } catch (error) {
            await interaction.reply(error)
        }
    },
};
