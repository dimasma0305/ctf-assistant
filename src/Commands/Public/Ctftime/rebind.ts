import { SubCommand } from "../../../Model/command";
import { SlashCommandSubcommandBuilder, Message } from "discord.js";
import { infoEvents } from "../../../Functions/ctftime";
import { getEmbedCTFEvent } from "./utils/utils";
import { ReactionRoleEvent } from "./utils/event";

export const command: SubCommand = {
    data: new SlashCommandSubcommandBuilder()
        .setName('rebind')
        .setDescription('Flush role from embed event message')
        .addNumberOption((option) => option
            .setName("event_id")
            .setDescription("event id")
            .setRequired(true)
        ).addNumberOption(option => option
            .setName("day")
            .setDescription("Set closure time (default: 1 day)")
        ).addBooleanOption(option => option
            .setName("private")
            .setDescription("Is this a private CTF event?")
        ).addStringOption(option => option
            .setName("password")
            .setDescription("Password for the private CTF event")
        ),
    async execute(interaction, _client) {
        const { options } = interaction;
        const guild = interaction.guild
        if (!guild) throw Error("guild not found!")

        const event_id = options.getNumber("event_id", true);
        const day = options.getNumber("day") || 1;
        const isPrivate = options.getBoolean("private") || false;
        const password = options.getString("password") || "";
        const data = await infoEvents(event_id.toString())

        const message = await getEmbedCTFEvent(interaction, data.title)

        const event = new ReactionRoleEvent(interaction, {
            ctfName: data.title,
            day,
            isPrivate,
            password
        })

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
        if (!reactions) throw new Error("can't find reaction")
        const reactionUsers = await reactions.users.fetch();
        reactionUsers.forEach(async (user) => {
            if (!user.bot) {
                const member = await guild.members.fetch(user);
                if (!member.roles.cache.has(role.name)) {
                    const dmChannel = await member.createDM()
                    await member.roles.add(role);
                    event.sendSuccessMessage(dmChannel)
                }
            }
        });

        event.addEventListener(message)

        return interaction.followUp({
            content: "The role has been added to all users who reacted with a white check mark.",
            ephemeral: true
        })
    },
};