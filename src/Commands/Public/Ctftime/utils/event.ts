import { CacheType, ChannelType, ChatInputCommandInteraction, DMChannel, Guild, GuildBasedChannel, Interaction, Message, Role, TextChannel } from "discord.js";

import { translate } from "../../../../Functions/discord-utils"
import { sleep } from "bun";

interface EventListenerOptions {
    ctfName: string;
    days: number;
    hours: number;
    isPrivate?: boolean;
    password?: string;
}

export class ReactionRoleEvent {
    interaction: Interaction
    channel: TextChannel
    guild: Guild;
    options: EventListenerOptions;
    discussChannel?: TextChannel;
    writeupChannel?: TextChannel;
    role?: Role;
    constructor(interaction: Interaction, options: EventListenerOptions) {
        this.interaction = interaction
        this.options = options
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
        this.initializeChannelAndRole()
    }
    async initializeChannelAndRole() {
        const ctfName = this.options.ctfName
        const role = await this.createEventRoleIfNotExist(ctfName)
        this.role = role
        this.discussChannel = await this.createDefaultChannelIfNotExist(ctfName, role)

        const credsMessage = await this.discussChannel.send({ content: `Halo temen-temen <@&${role.id}> silahkan untuk bergabung ke team bisa cek credensial yang akan diberikan Mas Dimas <@663394727688798231> XD` })
        credsMessage.pin('CTF Credential')

        this.writeupChannel = await this.createDefaultChannelIfNotExist(`${ctfName} writeup`, role)

        await this.writeupChannel.send({ content: `# 🌈 ${ctfName} Writeup 🚀

Selamat datang di channel ini, tempatnya untuk berbagi writeup seru dari CTF ${ctfName}! 😊 Ayo, mari kita berbagi pengetahuan dan kegembiraan setelah menyelesaikan CTF ini. Silakan bagikan Writeup (WU) kalian atau WU dari partisipan lain di channel ini. Jangan ragu untuk bertanya atau memberi saran jika ada yang perlu dibahas. Semoga kita semua bisa belajar dan tumbuh bersama! 🌟 UwU` })

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
    async createDefaultChannelIfNotExist(name: string, role: Role): Promise<TextChannel> {
        name = translate(name)
        var channel = this.guild.channels.cache.find((channel) => channel.name === name) as TextChannel
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
    async addEventListener(message: Message) {
        const { days, hours, isPrivate, password } = this.options
        const role = this.role
        try {
            if (!role) throw Error("Please wait until role has been created");
        } catch {
            await sleep(1000)
            this.addEventListener(message)
            return
        }
        if (isPrivate) {
            if (!(typeof password == "string")) {
                throw Error("Pasword isn't a string")
            }
        }

        const collector = message.createReactionCollector({
            filter: (reaction) => reaction.emoji.name === "✅",
            dispose: true,
            time: (days * 24 * 60 * 60 * 1000) + (hours * 60 * 60 * 1000),
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
                        this.sendSuccessMessage(dm);
                    } else {
                        this.sendFailureMessage(dm);
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
                this.sendSuccessMessage(dm);
            }
        })
    }
    sendFailureMessage(dmChannel: DMChannel) {
        dmChannel.send({
            content: `Authentication failed. Please provide the correct password to proceed.`,
        });
    }
    sendSuccessMessage(dmChannel: DMChannel) {

        dmChannel.send({
            content: `Successfully added the role for "${this.options.ctfName}"!`,
        });
        dmChannel.send({
            content: `Here's the channel for the CTF event. Good luck!`,
        });
        dmChannel.send({
            embeds: [{
                fields: [
                    { name: "**Discuss Channel**", value: `<#${this.discussChannel?.id}>` },
                    { name: "**Writeup Channel**", value: `<#${this.writeupChannel?.id}>` },
                ]
            }]
        });
    }
}

export async function getEmbedCTFEvent(interaction: ChatInputCommandInteraction<CacheType>, ctfTitle: string) {
    const channel = interaction.channel
    if (!channel) {
        return false
    }
    const messages = await channel.messages.fetch({ limit: 32 })
    const message = messages.find((value) => {
        if (value instanceof Message) {
            if (value.author.bot &&
                value?.embeds[0]?.data?.title?.startsWith(ctfTitle)) {
                return true;
            }
        }
        return false;
    });
    return message;
}
