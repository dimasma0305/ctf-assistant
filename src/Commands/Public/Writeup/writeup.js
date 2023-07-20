const { SlashCommandBuilder, Permissions } = require("discord.js");


module.exports = {
    data: new SlashCommandBuilder()
        .setName("writeup")
        .setDescription("writeup related command")
};
