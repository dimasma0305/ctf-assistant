import { ActionRowBuilder, APIActionRowComponent, APIMessageActionRowComponent, ButtonBuilder, ButtonStyle, CacheType, ChatInputCommandInteraction, ComponentType, DMChannel, Guild, GuildScheduledEventEntityType, GuildScheduledEventPrivacyLevel, GuildScheduledEventUser, Interaction, JSONEncodable, Message, Role, TextBasedChannel, TextChannel, User } from "discord.js";

import { sleep } from "bun";
import { CTFEvent } from "../../../../Functions/ctftime-v2";
import cron from 'node-cron';
import { dateToCron } from "../../../../Functions/discord-utils";

const ENV = process.env.ENV || 'production';

import { ChannelType, ColorResolvable } from "discord.js";
import { translate } from "../../../../Functions/discord-utils";

interface CreateChannelProps {
    channelName: string;
    guild: Guild;
    role: Role;
    callback?: ((channel: TextChannel) => Promise<void> | void)
}

export async function createPrivateChannelIfNotExist(props: CreateChannelProps) {
    const channelName = translate(props.channelName)
    const channels = await props.guild.channels.fetch()
    var channel = channels.find((channel) => channel?.name === channelName) as TextChannel
    if (!channel) {
        channel = await props.guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            permissionOverwrites: [
                {
                    id: props.guild.id,
                    deny: ["ViewChannel"]
                },
                {
                    id: props.role.id,
                    allow: ["ViewChannel"]
                }
            ]
        })
        if (props.callback) await props.callback(channel)
    }
    return channel
}

import { APIEmbed } from "discord.js";
import moment from "moment"

interface ScheduleEmbedTemplateProps {
    ctfEvent: CTFEvent;
}

export function scheduleEmbedTemplate(props: ScheduleEmbedTemplateProps): APIEmbed {
    const startTimestamp = Math.floor(props.ctfEvent.start.getTime() / 1000);
    const finishTimestamp = Math.floor(props.ctfEvent.finish.getTime() / 1000);

    return {
        title: `${props.ctfEvent.title}`,
        description: `${props.ctfEvent.title} start <t:${startTimestamp}:R> and end <t:${finishTimestamp}:R>`,
        url: `https://ctftime.org/event/${props.ctfEvent.id}`,
        thumbnail: {
            url: props.ctfEvent.logo,
        },
        fields: [
            { name: "**ID**", value: props.ctfEvent.id.toString(), inline: true },
            { name: "**Format**", value: props.ctfEvent.format, inline: true },
            { name: "**Location**", value: props.ctfEvent.location, inline: false },
            { name: "**Weight**", value: props.ctfEvent.weight.toString(), inline: true },
        ],
        footer: {
            text: `${moment(props.ctfEvent.start).utcOffset(8).format('ddd, MMM D, YYYY, HH:mm UTC+8')} - ${moment(props.ctfEvent.finish).utcOffset(8).format('ddd, MMM D, YYYY, HH:mm UTC+8')}`,
        },
    };
}



interface createRoleProps {
    guild: Guild;
    name: string;
    color: string;
}

export async function createRoleIfNotExist(props: createRoleProps) {
    var role = props.guild.roles.cache.find((role) => role.name === props.name)
    if (!role) {
        role = await props.guild.roles.create({
            name: props.name,
            color: props.color as ColorResolvable,
            permissions: [],
        })
    }
    return role
}


interface EventListenerOptions {
    ctfEvent: CTFEvent;
    notificationRole?: Role;
}

export class ReactionRoleEvent {
    guild: Guild;
    initialChannel: TextChannel;
    options: EventListenerOptions;
    discussChannel?: TextChannel;
    writeupChannel?: TextChannel;
    role?: Role;
    constructor(guild: Guild, initialChannel: TextChannel, options: EventListenerOptions) {
        this.options = options
        this.guild = guild
        this.initialChannel = initialChannel
    }
    async __initializeChannelAndRole() {
        const ctfName = this.options.ctfEvent.title
        const role = await this.createEventRoleIfNotExist(ctfName)
        this.role = role
        this.discussChannel = await this.createDefaultChannelIfNotExist(ctfName, role, async (channel) => {
            const credsMessage = await channel.send({ content: `Halo temen-temen <@&${role.id}> silahkan untuk bergabung ke team bisa cek credensial yang akan diberikan Mas Dimas <@663394727688798231> XD` },)
            credsMessage.pin('CTF Credential')
            setTimeout(async() => {
                if (ENV != 'development') await this.sendNotification()
            }, 100);
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
    async getDiscussChannel(){
        var channel = this.guild.channels.cache.get(translate(this.options.ctfEvent.title))
        if (!(channel instanceof TextChannel)) return
        return channel
    }
    async getWriteupChannel(){
        var channel = this.guild.channels.cache.get(translate(`${this.options.ctfEvent.title} writeup`))
        if (!(channel instanceof TextChannel)) return
        return channel
    }
    async createEventIfNotExist(){
        var event = this.guild.scheduledEvents.cache.find((event)=>event.name===this.options.ctfEvent.title && !event.isCanceled() && !event.isCompleted())

        if (!event){
            const description = this.options.ctfEvent.description.substr(0, 800)
            const ctftimeUrl = this.options.ctfEvent.ctftime_url
            const url = this.options.ctfEvent.url
            const organizers = this.options.ctfEvent.organizers
            const format = this.options.ctfEvent.format
            const weight = this.options.ctfEvent.weight
            var startTime = this.options.ctfEvent.start
            if (startTime.getTime() < new Date().getTime()){
                startTime = new Date(new Date().getTime() + 60000)
            }

            event = await this.guild.scheduledEvents.create({
                name: this.options.ctfEvent.title,
                scheduledStartTime: startTime,
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
                    location: `${ctftimeUrl} - ${url}`
                }
            })
            const mabarChannel = this.guild.channels.cache.find((channel)=>channel.name == "mabar-ctf") as TextChannel
            if (mabarChannel){
                await mabarChannel.send(`${event.url}`)
                await mabarChannel.send(`Halo teman-teman <@&${this.options.notificationRole?.id}> silahkan yang mau ikut mabar ${this.options.ctfEvent.title} bisa klik interest diatas ya XP`)
                // await mabarChannel.send(`Kalian juga bisa `)

            }
        }
        return event
    }
    async addRoleToUser(iuser: User){
        const role = await this.getRole()
        const user = this.guild.members.cache.find((user)=> user.id==iuser.id)
        if (!user) return
        if (user.roles.cache.get(role.name)) return false
        await user.roles.add(role)
        return true
    }
    async removeRoleFromUser(iuser: User){
        const role = await this.getRole()
        const user = this.guild.members.cache.find((user)=> user.id==iuser.id)
        if (!user) return
        if (user.roles.cache.get(role.name)) {
            await user.roles.remove(role)
            return true
        }
        return false
    }
    async addEvent() {
        await this.__initializeChannelAndRole()
        const role = await this.getRole()
        const event = await this.createEventIfNotExist()

        var subsBefore = await event.fetchSubscribers()
        const members = await this.guild.members.fetch()
        subsBefore.forEach(async (gUser)=>{
            const user = members.find((user)=> user.id==gUser.user.id)
            if (!user) return
            if (user.roles.cache.has(role.id)) return
            await this.addRoleToUser(gUser.user)
            const dm = await gUser.user.createDM()
            this.sendSuccessMessage(dm)
        })

        const updateSubscribers = async () => {
            const subs = await event.fetchSubscribers();
            subs.forEach(async (gUser) => {
                const user = members.find((user) => user.id == gUser.user.id);
                if (!user) return;
                if (user.roles.cache.has(role.id)) return;
                const dm = await gUser.user.createDM();
                await this.addRoleToUser(gUser.user);
                this.sendSuccessMessage(dm);
            });
            subsBefore.forEach(async (gUser) => {
                if (subs.get(gUser.user.id)) return;
                const dm = await gUser.user.createDM();
                await this.removeRoleFromUser(gUser.user);
                await dm.send(`Successfully removed the role for "${this.options.ctfEvent.title}"`);
            });
            subsBefore = subs;
        };

        const scheduleEndMessage = async () => {
            await this.discussChannel?.send(`Hai teman-teman, akhirnya <@&${role.id}> sudah berakhir, silahkan yang ingin menaruh writeup, bisa menaruh writeupnya di <#${this.writeupChannel?.id}> :P`);
            stopTasks();
            await this.archive()
        };

        const updateTask = cron.schedule('*/5 * * * * *', updateSubscribers);
        const endTask = cron.schedule(dateToCron(new Date(this.options.ctfEvent.finish)), scheduleEndMessage);
        
        const stopTasks = () => {
            updateTask.stop();
            endTask.stop();
        };
        await this.createMessageForRole()
    }

    async archive(){
        var archivesCategory = this.guild.channels.cache.find(channel => channel.name === "archives" && channel.type === ChannelType.GuildCategory);
        if (!archivesCategory) {
            archivesCategory = await this.guild.channels.create({name: "archives", type: ChannelType.GuildCategory});
        }
        if (!archivesCategory) return;
        const discussChannel =  await this.getDiscussChannel()
        const writeupChannel =  await this.getWriteupChannel()
        await discussChannel?.setParent(archivesCategory.id);
        await writeupChannel?.setParent(archivesCategory.id);
    }

    async addMessageRoleEventListener(msg: Message){
        this.__initializeChannelAndRole()
        const collector = msg.createMessageComponentCollector({
            filter: async (i) => {
                await i.deferUpdate()
                return i.user.id ? true : false
            },
            time: this.options.ctfEvent.finish.getTime() - new Date().getTime(),
            componentType: ComponentType.Button,
        })
        collector.on("collect", async (interaction)=>{
            if (interaction.customId == "join"){
                if (await this.addRoleToUser(interaction.user)){
                    const dm = await interaction.user.createDM()
                    this.sendSuccessMessage(dm)
                }
            }else if (interaction.customId == "leave"){
                if (await this.removeRoleFromUser(interaction.user)){
                    const dm = await interaction.user.createDM()
                    await dm.send(`Successfully remove the role for "${this.options.ctfEvent.title}"`)
                }
            }
        })
    }

    async createMessageForRole(){
        const join = new ButtonBuilder()
            .setCustomId('join')
            .setLabel('Join!')
            .setStyle(ButtonStyle.Primary);

        const leave = new ButtonBuilder()
            .setCustomId('leave')
            .setLabel('Leave!')
            .setStyle(ButtonStyle.Danger);

        const row = new ActionRowBuilder()
            .addComponents(join, leave);

        const message = await this.initialChannel.send({ "embeds": [scheduleEmbedTemplate({ ctfEvent: this.options.ctfEvent })], components: [row as JSONEncodable<APIActionRowComponent<APIMessageActionRowComponent>>] });
        await this.addMessageRoleEventListener(message);
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
                const mabarNotification = {
                    embeds: [{
                        title: "🎮 Notifikasi Mabar TCP1P",
                        description: `Hai teman-teman yang luar biasa!

Aku punya kabar seru nih! 🥳🎉 Kita akan mabar ${this.options.ctfEvent.title}! 💃🕹️ Jangan lupa cek info lengkapnya di <#1008578079016370246> ya!

Ayo semangat belajar bareng-bareng dan tingkatkan skill cyber security kita di CTF kali ini! 🚀💻 Jangan sampe kelewat, ya! ❤️`
                    }]
                };
                dmChannel.send(mabarNotification);
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
