import { SubCommand } from "../../../Model/command";
import { SlashCommandSubcommandBuilder, Message } from "discord.js";
import { infoEvents } from "../../../Functions/ctftime";
import { getEmbedCTFEvent } from "./utils/utils";

export const command: SubCommand = {
    data: new SlashCommandSubcommandBuilder()
        .setName('flush')
        .setDescription('Flush role from embed event message')
        .addNumberOption((option) => option
            .setName("event_id")
            .setDescription("event id")
            .setRequired(true)
        ),
    async execute(interaction, _client) {
        const { options } = interaction;
        const guild = interaction.guild
        if (!guild) return
        interaction.deferReply({ ephemeral: true })

        const event_id = options.getNumber("event_id", true);
        const data = await infoEvents(event_id.toString())

        const message = await getEmbedCTFEvent(interaction, data.title)

        if (!(message instanceof Message)) {
            return interaction.editReply({
                content: "Unable to find the specified message. Please provide a valid message ID.",
            });
        }

        const role = guild.roles.cache.find((role) => {
            return role.name === data.title
        })

        if (!role) {
            return interaction.editReply({
                content: "Unable to find the specified role. Please provide a valid role ID.",
            });
        }

        // Add the role to all users who reacted with a white check mark
        const reactions = message.reactions.cache.get("✅");
        if (!reactions) return
        const reactionUsers = await reactions.users.fetch();
        reactionUsers.forEach(async (user) => {
            if (!user.bot) {
                const member = await guild.members.fetch(user);
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
