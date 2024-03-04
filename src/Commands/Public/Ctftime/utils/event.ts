import { CacheType, ChatInputCommandInteraction, DMChannel, Guild, Interaction, Message, Role, TextChannel } from "discord.js";

import { sleep } from "bun";
import { createPrivateChannelIfNotExist, createRoleIfNotExist } from "./event_utility";
import { CTFEvent } from "../../../../Functions/ctftime-v2";

interface EventListenerOptions {
    ctfEvent: CTFEvent;
    isPrivate?: boolean;
    password?: string;
    notificationRole?: Role;
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
    }
    async __initializeChannelAndRole() {
        const ctfName = this.options.ctfEvent.title
        const role = await this.createEventRoleIfNotExist(ctfName)
        this.role = role
        this.discussChannel = await this.createDefaultChannelIfNotExist(ctfName, role, async (channel) => {
            const credsMessage = await channel.send({ content: `Halo temen-temen <@&${role.id}> silahkan untuk bergabung ke team bisa cek credensial yang akan diberikan Mas Dimas <@663394727688798231> XD` },)
            credsMessage.pin('CTF Credential')
            this.sendNotification()
        })

        this.writeupChannel = await this.createDefaultChannelIfNotExist(`${ctfName} writeup`, role, async (channel) => {
            await channel.send({
                content: `# ${ctfName} Writeup 🚀

Selamat datang di channel ini, tempatnya untuk berbagi writeup seru dari CTF ${ctfName}! 😊 Ayo, mari kita berbagi pengetahuan dan kegembiraan setelah menyelesaikan CTF ini. Silakan bagikan Writeup (WU) kalian atau WU dari partisipan lain di channel ini. Jangan ragu untuk bertanya atau memberi saran jika ada yang perlu dibahas. Semoga kita semua bisa belajar dan tumbuh bersama! 🌟 UwU`
            })
        })
    }

    async createEventRoleIfNotExist(ctfName: string) {
        return await createRoleIfNotExist({
            name: ctfName,
            guild: this.guild,
            color: "#AF1257"
        })
    }
    async createDefaultChannelIfNotExist(name: string, role: Role, callback: ((channel: TextChannel) => Promise<void> | void) | undefined = undefined): Promise<TextChannel> {
        return await createPrivateChannelIfNotExist({
            channelName: name,
            guild: this.guild,
            role: role,
            callback: callback
        })
    }
    async addEventListener(message: Message) {
        await this.__initializeChannelAndRole()
        const { isPrivate, password } = this.options
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
            time: this.options.ctfEvent.finish.getTime() - Date.now(),
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
        collector.on("remove", async (reaction, user) => {
            const guild = reaction.message.guild
            if (!guild) {
                throw Error("Guild not found")
            }
            const guildMember = guild.members.cache.find((member) => member.id === user.id);
            if (!guildMember) {
                throw Error("Guild member not found")
            }
            const dm = await user.createDM();
            await guildMember.roles.remove(role)
            await dm.send(`Successfully remove the role for "${this.options.ctfEvent.title}"`)
        })
        collector.on("end", () => {
            this.channel.send(`Yay! Akhirnya ${this.options.ctfEvent.title} sudah berakhir. Terima kasih, teman-teman, sudah bermain bersama aku di ${this.options.ctfEvent.title} <@&${role.id}>! Jangan lupa untuk bergabung di mabar selanjutnya ya, pasti seru! 😄🎉`)
        })
    }

    async sendNotification() {
        const notificationRole = this.options.notificationRole
        if (notificationRole) {
            notificationRole.members.forEach(async (member) => {
                const dmChannel = await member.createDM(true)
                const notifikasiMabar = {
                    embeds: [{
                        title: "🎮 Notifikasi Mabar TCP1P",
                        description: `Hai teman-teman yang luar biasa!

Aku punya kabar seru nih! 🥳🎉 Kita akan mabar ${this.options.ctfEvent.title}! 💃🕹️ Jangan lupa cek info lengkapnya di <#1008578079016370246> ya!

Ayo semangat belajar bareng-bareng dan tingkatkan skill cyber security kita di CTF kali ini! 🚀💻 Jangan sampe kelewat, ya! ❤️`
                    }]
                };
                dmChannel.send(notifikasiMabar);
            })
        }
    }

    sendFailureMessage(dmChannel: DMChannel) {
        dmChannel.send({
            content: `Authentication failed. Please provide the correct password to proceed.`,
        });
    }
    sendSuccessMessage(dmChannel: DMChannel) {
        dmChannel.send({
            content: `Successfully added the role for "${this.options.ctfEvent.title}"!`,
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
