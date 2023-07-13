const {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    Client,
    PermissionsBitField
} = require("discord.js");

const { ManageMessages } = PermissionsBitField.Flags;


module.exports = {
    data: new SlashCommandBuilder()
        .setName("echo")
        .setDescription("will echo")
        .addStringOption(option => option
            .setName("text")
            .setDescription("text to echo")
            .setRequired(true)
        )
        .addStringOption(option => option
            .setName("encoding")
            .setDescription("encoding")
            .addChoices(
                { name: "base64", value: "base64" },
                { name: "urlencode", value: "urlencode" }
            ))
        .setDefaultMemberPermissions(ManageMessages),
    /**
     *
     * @param {ChatInputCommandInteraction} interaction
     * @param {Client} _client
     */
    async execute(interaction, _client) {
        const { options } = interaction;
        const encoding = options.getString("encoding")
        let text = options.getString("text")
        try {
            if (encoding) {
                switch (encoding) {
                    case "base64":
                        text = atob(text)
                        break;
                    case "urlencode":
                        text = decodeURIComponent(text)
                        break
                    default:
                        return interaction.reply({
                            content: "encoding not found!",
                            ephemeral: true
                        })
                }
            }
        } catch (error) {
            return interaction.reply({
                content: error,
                ephemeral: true
            })
        }
        await interaction.deferReply()
        interaction.channel.send({
            content: text
        })
        return interaction.deleteReply()
    },
};
