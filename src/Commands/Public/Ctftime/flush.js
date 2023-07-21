const { ChatInputCommandInteraction, Client, SlashCommandSubcommandBuilder, Message } = require("discord.js");
const { infoEvents } = require("../../../Functions/ctftime");
const { getEmbedCTFEvent } = require("./utils/utils");

module.exports = {
    subCommand: "ctftime.flush",
    data: new SlashCommandSubcommandBuilder()
        .setName('flush')
        .setDescription('Flush role from embed event message')
        .addNumberOption((option) => option
            .setName("event_id")
            .setDescription("event id")
            .setRequired(true)
        ),
    /**
     *
     * @param {ChatInputCommandInteraction} interaction
     * @param {Client} _client
     */
    async execute(interaction, _client) {
        const { options } = interaction;

        interaction.deferReply({ ephemeral: true })

        const event_id = options.getNumber("event_id");
        const data = await infoEvents(event_id)

        const message = await getEmbedCTFEvent(interaction, data.title)

        if (!(message instanceof Message)) {
            return interaction.editReply({
                content: "Unable to find the specified message. Please provide a valid message ID.",
                ephemeral: true,
            });
        }

        const role = interaction.guild.roles.cache.find((role) => {
            return role.name === data.title
        })

        if (!role) {
            return interaction.editReply({
                content: "Unable to find the specified role. Please provide a valid role ID.",
                ephemeral: true,
            });
        }

        // Add the role to all users who reacted with a white check mark
        const reactions = message.reactions.cache.get("✅");
        const reactionUsers = await reactions.users.fetch();


        reactionUsers.forEach(async (user) => {
            if (!user.bot) {
                const member = await interaction.guild.members.fetch(user);
                if (!member.roles.cache.has(role.name)) {
                    await member.roles.add(role);
                }
            }
        });

        return interaction.followUp({
            content: "The role has been added to all users who reacted with a white check mark.",
            ephemeral: true
        })
    },
};
