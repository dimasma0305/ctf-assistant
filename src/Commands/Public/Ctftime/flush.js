const { ChatInputCommandInteraction, Client, PermissionsBitField, SlashCommandSubcommandBuilder, Message } = require("discord.js");
const { ManageRoles, ManageChannels } = PermissionsBitField.Flags;
const { infoEvents } = require("../../../Functions/ctftime");

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

        await interaction.deferReply({ ephemeral: true })

        const event_id = options.getNumber("event_id");
        const data = await infoEvents(event_id)

        const messages = await interaction.channel.messages.fetch({ limit: 32 })
        // get the embeded event
        const message = messages.find((value) => {
            if (value instanceof Message) {
                if (value.author.bot &&
                    value?.embeds[0]?.data?.title?.startsWith(data.title)) {
                    return true
                }
            }
            return false
        })

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
