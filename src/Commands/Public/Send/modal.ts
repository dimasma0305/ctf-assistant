import { SubCommand } from "../../../Model/command";

import { SlashCommandSubcommandBuilder, ActionRowBuilder, TextInputStyle, ModalBuilder, TextInputBuilder } from "discord.js";

export const command: SubCommand = {
    data: new SlashCommandSubcommandBuilder()
        .setName('modal')
        .setDescription('send a message with that get input from modal'),
    async execute(interaction, _client) {

        const modal = new ModalBuilder()
            .setCustomId('modal')
            .setTitle('Text');

        const textInput = new TextInputBuilder()
            .setCustomId('text')
            .setLabel("Input the text to show?")
            .setStyle(TextInputStyle.Paragraph);

        modal.addComponents(
            new ActionRowBuilder()
                .addComponents(textInput) as ActionRowBuilder<TextInputBuilder>
        );

        await interaction.showModal(modal);

        const submission = await interaction.awaitModalSubmit({ time: 60 * 100 });

        await submission.deferReply({ ephemeral: true })

        const text = submission.fields.getTextInputValue('text')
        const channel = interaction.channel
        if (!channel) {
            return
        }
        await interaction.channel.send(text)
        await submission.deleteReply()
    },
};
