import { SubCommand } from "../../../Model/command";
import { SlashCommandSubcommandBuilder, Message } from "discord.js";
import { CTFEvent, infoEvent } from "../../../Functions/ctftime-v2";
import { getEmbedCTFEvent } from "./utils/event";
import { ReactionRoleEvent } from "./utils/event";

export const command: SubCommand = {
    data: new SlashCommandSubcommandBuilder()
        .setName('rebind')
        .setDescription('Flush role from embed event message')
        .addStringOption((option) => option
            .setName("id")
            .setDescription("event id")
            .setRequired(true)
        ).addBooleanOption(option => option
            .setName("is_dummie")
            .setDescription("Is CTF dummy?")
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

        const id = options.getString("id", true);
        const is_dummie = options.getBoolean("is_dummie");
        let ctfEvent: CTFEvent;
        if (is_dummie) {
          ctfEvent = {
            ctf_id: 0,
            ctftime_url: "placeholder",
            description: "placeholder",
            duration: {
              days: 2,
              hours: 2 * 24,
            },
            finish: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
            format: "placeholder",
            format_id: 0,
            id: 0,
            is_votable_now: false,
            live_feed: "placeholder",
            location: "placeholder",
            logo: "https://avatars.githubusercontent.com/u/109392350",
            onsite: false,
            organizers: [{ id: 0, name: "placeholder" }],
            participants: 0,
            public_votable: false,
            restrictions: "placeholder",
            start: new Date(Date.now()),
            title: id,
            url: "placeholder",
            weight: 0
          }
        } else {
          ctfEvent = await infoEvent(id)
        }
        const isPrivate = options.getBoolean("private") || false;
        const password = options.getString("password") || "";

        await interaction.deferReply({ ephemeral: true })


        const message = await getEmbedCTFEvent(interaction, ctfEvent.title)

        const event = new ReactionRoleEvent(interaction, {
            ctfEvent: ctfEvent,
            isPrivate,
            password
        })

        if (!(message instanceof Message)) {
            return interaction.editReply({
                content: "Unable to find the specified message. Please provide a valid message ID.",
            });
        }

        const role = guild.roles.cache.find((role) => {
            return role.name === ctfEvent.title
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
