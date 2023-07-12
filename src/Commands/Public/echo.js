const {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    Client
} = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("echo")
        .setDescription("will echo")
        .addStringOption(option =>
            option.setName("text")
                .setDescription("text to echo")
        ),
    /**
     *
     * @param {ChatInputCommandInteraction} interaction
     * @param {Client} _client
     */
    async execute(interaction, _client) {
        const permissionAdmin = [ManageRoles, ManageChannels];
        if (!interaction.member.permissions.has(permissionAdmin)) {
            return interaction.reply({
                content: "This command is only available to the admin",
                ephemeral: true,
            });
        }

        const { options } = interaction;
        const text = options.getString("text");
        if (!text) {
            return interaction.reply({
                content: "you need to provide the text",
                ephemeral: true
            })
        }
        interaction.reply(text)


    },
};
