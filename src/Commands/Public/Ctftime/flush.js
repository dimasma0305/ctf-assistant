const { ChatInputCommandInteraction, Client, Permissions } = require("discord.js");

module.exports = {
    subCommand: "ctftime.schedule",
    /**
     *
     * @param {ChatInputCommandInteraction} interaction
     * @param {Client} _client
     */
    async execute(interaction, _client) {
        const { options } = interaction;

        // Check if the user has the required permissions
        if (!interaction.member.permissions.has(Permissions.FLAGS.MANAGE_ROLES)) {
            return interaction.reply({
                content: "This command is only available to administrators who can manage roles.",
                ephemeral: true,
            });
        }

        // Retrieve the message ID from the command options
        const messageId = options.getString("message_id");

        // Retrieve the role ID from the command options
        const roleId = options.getString("role_id");

        // Fetch the message by its ID
        const channel = interaction.channel;
        const message = await channel.messages.fetch(messageId)
            .catch(() => null); // Handle if the message could not be found

        if (!message) {
            return interaction.reply({
                content: "Unable to find the specified message. Please provide a valid message ID.",
                ephemeral: true,
            });
        }

        // Fetch the role by its ID
        const role = interaction.guild.roles.cache.get(roleId);

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
                member.roles.add(role);
            }
        });

        interaction.reply("The role has been added to all users who reacted with a white check mark.");
    },
};
