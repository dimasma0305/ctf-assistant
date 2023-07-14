const {
    ChatInputCommandInteraction,
    SlashCommandBuilder,
} = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("test")
        .setDescription("testing"),
    /**
     *
     * @param {ChatInputCommandInteraction} interaction
     */
    async execute(interaction) {
        const a = interaction.reply({ content: "pong", ephemeral: true });
        const collector = interaction.channel.createMessageCollector();

        collector.on('collect', m => {
            console.log(`Collected ${m.content}`);
        });

        collector.on('end', collected => {
            console.log(`Collected ${collected.size} items`);
        });
    },
};
