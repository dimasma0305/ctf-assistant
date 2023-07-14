const { ChatInputCommandInteraction, Client, PermissionsBitField, SlashCommandSubcommandBuilder } = require("discord.js");
const { ManageRoles, ManageChannels } = PermissionsBitField.Flags;

module.exports = {
    subCommand: "ctftime.flush",
    data: new SlashCommandSubcommandBuilder()
        .setName('flush')
        .setDescription('Flush role from specific message id')
        .addStringOption((option) =>
            option.setName("message_id").setDescription("message id")
        )
        .addStringOption((option) =>
            option.setName("role_name").setDescription("role name")
        ),
    /**
     *
     * @param {ChatInputCommandInteraction} interaction
     * @param {Client} _client
     */
    async execute(interaction, _client) {
        const { options } = interaction;
        await interaction.deferReply({ ephemeral: true })

        // Check if the user has the required permissions
        if (!interaction.member.permissions.has(ManageRoles, ManageChannels)) {
            return interaction.reply({
                content: "This command is only available to administrators who can manage roles.",
                ephemeral: true,
            });
        }

        // Retrieve the message ID from the command options
        const messageId = options.getString("message_id");

        // Retrieve the role ID from the command options
        const roleId = options.getString("role_name");

        // Fetch the message by its ID
        const channel = interaction.channel;
        let message;
        try {
            message = await channel.messages.fetch(messageId);
        } catch (e) {
            message = null
        }

        if (!message) {
            return interaction.reply({
                content: "Unable to find the specified message. Please provide a valid message ID.",
                ephemeral: true,
            });
        }

        // Fetch the role by its ID
        const role = interaction.guild.roles.cache.find((value, _key, _collection) => {
            if (value.name.toLowerCase().includes(roleId.toLowerCase())) {
                return true
            }
        });

        if (!role) {
            return interaction.reply({
                content: "Unable to find the specified role. Please provide a valid role ID.",
                ephemeral: true,
            });
        }

        // React to the message with a white check mark
        await message.react("✅");

        // Add the role to all users who reacted with a white check mark
        const reactions = message.reactions.cache.get("✅");
        const reactionUsers = await reactions.users.fetch();

        reactionUsers.forEach(async (user) => {
            if (!user.bot) {
                const member = await interaction.guild.members.fetch(user);
                if (!member.roles.cache.has(role)) {
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
