const {
    ChatInputCommandInteraction,
    Client,
    SlashCommandSubcommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    TextInputStyle,
    ModalBuilder,
    TextInputBuilder,
} = require("discord.js");

module.exports = {
    subCommand: "send.modal",
    data: new SlashCommandSubcommandBuilder()
        .setName('modal')
        .setDescription('send a message with that get input from modal'),
    /**
     *
     * @param {ChatInputCommandInteraction} interaction
     * @param {Client} _client
     */
    async execute(interaction, _client) {

        const modal = new ModalBuilder()
            .setCustomId('modal')
            .setTitle('Text');

        const textInput = new TextInputBuilder()
            .setCustomId('text')
            .setLabel("Input the text to show?")
            .setStyle(TextInputStyle.Paragraph);

        modal.addComponents(
            new ActionRowBuilder().addComponents(textInput)
        );


        await interaction.showModal(modal);

        const submission = await interaction.awaitModalSubmit({ time: 60 * 1000 });

        await submission.deferReply({ ephemeral: true })

        const text = submission.fields.getTextInputValue('text')

        await interaction.channel.send(text)

        await submission.deleteReply({ ephemeral: true })
    },
};
