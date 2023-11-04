import { Channel, ChannelType, DMChannel, Guild, Interaction, Message, Role, TextChannel } from "discord.js";

interface EventListenerOptios {
    ctfName: string;
    day: number;
    isPrivate?: boolean;
    password?: string;
}

export class ReactionRoleEvent {
    interaction: Interaction
    channel: TextChannel
    guild: Guild;
    constructor(interaction: Interaction) {
        this.interaction = interaction
        const channel = interaction.channel
        const guild = interaction.guild
        if (!(channel instanceof TextChannel)) {
            throw Error("Channel is not instance of TextChannel")
        }
        if (!(guild instanceof Guild)) {
            throw Error("guild is not instace of Guild")
        }
        this.channel = channel
        this.guild = guild
    }
    async createEventRoleIfNotExist(ctfName: string) {
        var role = this.guild.roles.cache.find((role) => role.name === ctfName)
        if (!role) {
            role = await this.guild.roles.create({
                name: ctfName,
                color: "#AF1257",
                permissions: [],
            })
        }
        return role
    }
    async createDefaultChannelIfNotExist(name: string, role: Role) {
        var channel = this.guild.channels.cache.find((channel) => channel.name === name)
        if (!channel) {
            channel = await this.guild.channels.create({
                name: name,
                type: ChannelType.GuildText,
                permissionOverwrites: [
                    {
                        id: this.guild.id,
                        deny: ["ViewChannel"]
                    },
                    {
                        id: role.id,
                        allow: ["ViewChannel"]
                    }
                ]
            })
        }
        return channel
    }
    async addEventListener(message: Message, options: EventListenerOptios) {
        const { ctfName, day, isPrivate, password } = options
        const role = await this.createEventRoleIfNotExist(ctfName)
        const discussChannel = await this.createDefaultChannelIfNotExist(ctfName, role)
        const writeupChannel = await this.createDefaultChannelIfNotExist(`${ctfName} writeup`, role)
        if (isPrivate) {
            if (!(typeof password == "string")) {
                throw Error("Pasword isn't a string")
            }
        }
        const collector = message.createReactionCollector({
            filter: (reaction) => reaction.emoji.name === "✅",
            dispose: true,
            time: day * 24 * 60 * 60 * 1000,
        })
        collector.on("collect", async (reaction, user) => {
            const guild = reaction.message.guild
            if (!guild) {
                throw Error("Guild not found")
            }
            const guildMember = guild.members.cache.find((member) => member.id === user.id);
            if (!guildMember) {
                throw Error("Guild member not found")
            }

            const dm = await user.createDM();

            if (isPrivate) {
                dm.send("Input the password: ");
                const collector = dm.createMessageCollector({
                    filter: (message) => message.author.id === user.id,
                    max: 1,
                    time: 60 * 1000
                });
                collector.on("collect", async (message) => {
                    if (message.content === password) {
                        guildMember.roles.add(role);
                        sendSuccessMessage(dm);
                    } else {
                        sendFailureMessage(dm);
                        reaction.users.remove(message.author.id);
                    }
                });
                collector.on("end", (collected) => {
                    if (collected.size === 0) {
                        dm.send("Request timed out");
                        reaction.users.remove(user);
                    }
                });
            } else {
                guildMember.roles.add(role);
                sendSuccessMessage(dm);
            }
        })
        function sendSuccessMessage(dmChannel: DMChannel) {
            dmChannel.send({
                content: `Successfully added the role for "${ctfName}"!`,
            });
            dmChannel.send({
                content: `Here's the channel for the CTF event. Good luck!`,
            });
            dmChannel.send({
                embeds: [{
                    fields: [
                        { name: "**Discuss Channel**", value: `<#${discussChannel.id}>` },
                        { name: "**Writeup Channel**", value: `<#${writeupChannel.id}>` },
                    ]
                }]
            });
        }

        function sendFailureMessage(dmChannel: DMChannel) {
            dmChannel.send({
                content: `Authentication failed. Please provide the correct password to proceed.`,
            });
        }
    }
}
