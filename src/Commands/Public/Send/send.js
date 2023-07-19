const {
    SlashCommandBuilder,
    PermissionsBitField,
    ChatInputCommandInteraction,
    Client
} = require("discord.js");
const { Administrator } = PermissionsBitField.Flags;

module.exports = {
    data: new SlashCommandBuilder()
        .setName("send")
        .setDescription("Send message to the server")
        .setDefaultMemberPermissions(Administrator)

};
