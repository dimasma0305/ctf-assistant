import { CacheType, Channel, ChatInputCommandInteraction, DMChannel, Guild, GuildScheduledEventEntityType, GuildScheduledEventPrivacyLevel, GuildScheduledEventUser, Interaction, Message, Role, TextBasedChannel, TextChannel } from "discord.js";

import { sleep } from "bun";
import { createPrivateChannelIfNotExist, createRoleIfNotExist } from "./event_utility";
import { CTFEvent } from "../../../../Functions/ctftime-v2";
import { event } from "../../../../Events/Client/cron";
import { MyClient } from "../../../../Model/client";

interface EventListenerOptions {
    ctfEvent: CTFEvent;
    isPrivate?: boolean;
    password?: string;
    notificationRole?: Role;
}

export class ReactionRoleEvent {
    guild: Guild;
    options: EventListenerOptions;
    discussChannel?: TextChannel;
    writeupChannel?: TextChannel;
    role?: Role;
    constructor(guild: Guild, options: EventListenerOptions) {
        this.options = options
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
    async createEventIfNotExist(){
        var event = this.guild.scheduledEvents.cache.find((event)=>event.name == this.options.ctfEvent.title && !event.isCanceled() && !event.isCompleted())

        if (!event){
            const description = this.options.ctfEvent.description
            const ctftime_url = this.options.ctfEvent.ctftime_url
            const url = this.options.ctfEvent.url
            const organizers = this.options.ctfEvent.organizers
            const format = this.options.ctfEvent.format
            const weight = this.options.ctfEvent.weight

            event = await this.guild.scheduledEvents.create({
                name: this.options.ctfEvent.title,
                scheduledStartTime: this.options.ctfEvent.start,
                scheduledEndTime: this.options.ctfEvent.finish,
                privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
                entityType: GuildScheduledEventEntityType.External,
                description: `${description}

:busts_in_silhouette: **Organizers**
${organizers.map((organizer)=>organizer.name).join("\n")}

:gear: **Format**
${format}

:dart: **Weight**
${weight}
`,
                image: this.options.ctfEvent.logo,
                entityMetadata: {
                    location: `${ctftime_url} - ${url}`
                }
            })
        }
        return event
    }
    async addRoleToUser(guser: GuildScheduledEventUser<false>){
        const role = await this.getRole()
        const user = this.guild.members.cache.find((user)=> user.id==guser.user.id)
        if (!user) return
        if (user.roles.cache.get(role.name)) return
        await user.roles.add(role)
    }
    async removeRoleFromUser(guser: GuildScheduledEventUser<false>){
        const role = await this.getRole()
        const user = this.guild.members.cache.find((user)=> user.id==guser.user.id)
        if (!user) return
        await user.roles.remove(role)
    }
    async addEvent() {
        this.__initializeChannelAndRole()
        const role = await this.getRole()
        const event = await this.createEventIfNotExist()
        var subsbefore = await event.fetchSubscribers()
        subsbefore.forEach(async (guser)=>{
            const user = this.guild.members.cache.find((user)=> user.id==guser.user.id)
            if (!user) return
            if (user.roles.cache.get(role.name)) return
            await this.addRoleToUser(guser)
            const dm = await guser.user.createDM()
            this.sendSuccessMessage(dm)
        })
        const interval_id = setInterval(async()=>{
            if (event.isCompleted()) {
                clearInterval(interval_id)
                return
            }
            const subs = await event.fetchSubscribers()
            subs.forEach(async (guser)=>{
                if (subsbefore.get(guser.user.id)) return
                const dm = await guser.user.createDM()
                await this.addRoleToUser(guser)
                this.sendSuccessMessage(dm)
            })
            subsbefore.forEach(async (guser)=>{
                if (subs.get(guser.user.id)) return
                const dm = await guser.user.createDM()
                await this.removeRoleFromUser(guser)
                await dm.send(`Successfully remove the role for "${this.options.ctfEvent.title}"`)
            })
            subsbefore = subs
        }, 1000)
    }
    async getRole(): Promise<Role> {
        const role = this.role
        if (!role) {
            await sleep(1000)
            return this.getRole()
        }
        return role
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
