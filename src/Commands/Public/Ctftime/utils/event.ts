import { ActionRowBuilder, APIActionRowComponent, APIMessageActionRowComponent, ButtonBuilder, ButtonStyle, CacheType, ChatInputCommandInteraction, ComponentType, DMChannel, Guild, GuildScheduledEventEntityType, GuildScheduledEventPrivacyLevel, GuildScheduledEventUser, Interaction, JSONEncodable, Message, Role, TextBasedChannel, TextChannel, User } from "discord.js";

import { sleep } from "bun";
import { CTFEvent, infoEvent } from "../../../../Functions/ctftime-v2";
import cron from 'node-cron';
import { dateToCron } from "../../../../Functions/discord-utils";
import { MessageModel } from "../../../../Database/connect";

const ENV = process.env.ENV || 'production';

import { ChannelType, ColorResolvable } from "discord.js";
import { translate } from "../../../../Functions/discord-utils";

interface CreateChannelProps {
    channelName: string;
    guild: Guild;
    role: Role;
    data?: Object;
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
            ],
            topic: JSON.stringify(props.data || {})
        })
        if (props.callback) await props.callback(channel)
    }
    return channel
}

import { APIEmbed } from "discord.js";
import moment from "moment"
import { MyClient } from "../../../../Model/client";
import { openai, isOpenAIConfigured } from "../../../../utils/openai";

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

// Template messages for CTF end notifications
const ctfEndMessageTemplates = [
    `Hai teman-teman, akhirnya <@&{roleId}> sudah berakhir! :P`,
    `Yeay! CTF <@&{roleId}> telah selesai! Semoga kalian dapat banyak ilmu baru! 🎉`,
    `Selamat! <@&{roleId}> sudah berakhir. Time to celebrate! 🥳`,
    `Well done everyone! <@&{roleId}> telah usai. Great job! 👏`,
    `Horee! <@&{roleId}> sudah selesai. Kalian luar biasa! 💪`
];

// Function to generate dynamic CTF end messages using OpenAI with template fallback
async function generateCtfEndMessage(ctfTitle: string, roleId: string): Promise<string> {
    if (!isOpenAIConfigured()) {
        console.log('🔄 OpenAI not configured, using template fallback');
        const randomTemplate = ctfEndMessageTemplates[Math.floor(Math.random() * ctfEndMessageTemplates.length)];
        return randomTemplate.replace('{roleId}', roleId);
    }

    try {
        const completion = await openai.chat.completions.create({
            model: 'deepseek-reasoner',
            messages: [
                {
                    role: 'system',
                    content: 'You are Hackerika, an AI companion for the TCP1P Community. Generate a friendly, celebratory message in Indonesian to announce that a CTF competition has ended. The message should be encouraging, congratulatory, and mention the role. Use casual, fun language with emojis. Only return the message, nothing else. Use Indonesian language mixed with some English terms where appropriate.'
                },
                {
                    role: 'user',
                    content: `Generate an end message for CTF "${ctfTitle}" that just finished. Include <@&${roleId}> to mention the participants. Make it celebratory and encouraging.`
                }
            ],
            max_tokens: 200,
            temperature: 0.8,
            n: 1,
        });

        const aiMessage = completion.choices[0].message.content;
        if (aiMessage && aiMessage.trim().length > 0) {
            console.log('✅ Generated dynamic CTF end message with OpenAI');
            return aiMessage;
        } else {
            throw new Error('Empty response from OpenAI');
        }
    } catch (error) {
        console.error('❌ Error generating CTF end message with OpenAI:', error);
        
        // Check if it's a token limit or rate limit error
        if (error instanceof Error && (
            error.message.includes('quota') || 
            error.message.includes('limit') || 
            error.message.includes('token') ||
            error.message.includes('rate')
        )) {
            console.log('🔄 OpenAI token/rate limit reached, using template fallback');
        } else {
            console.log('🔄 OpenAI unavailable, using template fallback');
        }
        
        // Fallback to random template message
        const randomTemplate = ctfEndMessageTemplates[Math.floor(Math.random() * ctfEndMessageTemplates.length)];
        console.log('📝 Using template message as fallback');
        return randomTemplate.replace('{roleId}', roleId);
    }
}


interface EventListenerOptions {
    ctfEvent: CTFEvent;
    notificationRole?: Role;
    author?: User
}

export class ReactionRoleEvent {
    guild: Guild;
    initialChannel: TextChannel;
    options: EventListenerOptions;
    discussChannel?: TextChannel;
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
            const credsMessage = await channel.send({ content: `
# 🎉 Selamat Datang di Ruang Diskusi ${ctfName}!

<@&${role.id}> **Mari kolaborasi dan belajar bersama!** 💻✨

## 🔑 **Manajemen Kredensial**
⚠️ **PENTING:**  
1. Buat credential dengan format:  
   \`\`\`md
   [Nama Tim/Individu] : [Password/Token]
   \`\`\`
2. Posting credential di channel ini **SAJA** (channel privat)
3. Update credential jika ada perubahan

> 🛡️ Channel ini hanya bisa diakses anggota <@&${role.id}>!

## 📋 Panduan Diskusi
### 🧵 Cara Membuat Thread
1. **Format nama thread:**  
   \`\`\`fix
   [Kategori] Nama Challenge
   \`\`\`
   Contoh:  
   \`\`\`md
   [Web] Baby SQLi
   [Forensic] Memory Analysis
   \`\`\`

2. **Manfaatkan thread untuk:**
   - 🚧 Diskusi progress penyelesaian
   - 💬 Brainstorming solusi bersama
   - 📁 Sharing payload/exploit

## 🛠️ Command Solve 
\`\`\`bash
# Auto-detect nama challenge dari thread
/solve challenge players:@partisipan1 @partisipan2

# Initialize challenges dari platform CTF
/solve init json:"<JSON_DATA>" platform:ctfd

\`\`\`

## 📡 **CTF Platform JSON Endpoints**
🔗 **Untuk auto-import challenges:**
- **CTFd:** \`/api/v1/challenges\`
- **rCTF:** \`/api/v1/challs\`  
- **GzCTF:** \`/api/game/{id}/challenges\`
- **picoCTF:** \`/api/challenges\`
- **Contoh:** \`https://ctf.example.com/api/v1/challenges\`

> 💡 Copy JSON dari endpoint tersebut, lalu gunakan \`/solve init\`
            `.trim() })
            credsMessage.pin('Panduan Resmi CTF');
            setTimeout(async() => {
                if (ENV != 'development') await this.sendNotification()
            }, 100);
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
            data: {id: this.options.ctfEvent.id},
            callback: callback
        })
    }
    async getDiscussChannel(){
        const channels = await this.guild.channels.fetch()
        const name = translate(this.options.ctfEvent.title)
        var channel = channels.find((channel) => channel?.name === name) as TextChannel
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

:person_frowning: **Invoked By**
<@${this.options.author?.id || "Hackerika"}>
`,
                image: this.options.ctfEvent.logo,
                entityMetadata: {
                    location: `${ctftimeUrl} - ${url}`
                }
            })
            const mabarChannel = this.guild.channels.cache.find((channel)=>channel.name.includes("mabar-ctf")) as TextChannel
            if (mabarChannel){
                await mabarChannel.send(`${event.url}`)
                await mabarChannel.send(`Halo teman-teman <@&${this.options.notificationRole?.id}> silahkan yang mau ikut mabar ${this.options.ctfEvent.title} bisa klik interest diatas ya XP`)
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
            const members = await this.guild.members.fetch();
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
            const endMessage = await generateCtfEndMessage(this.options.ctfEvent.title, role.id);
            await this.discussChannel?.send(endMessage);
            stopTasks();
            await this.archive()
        };

        const updateTask = cron.schedule('*/5 * * * * *', updateSubscribers);
        const endTask = cron.schedule(dateToCron(new Date(this.options.ctfEvent.finish)), scheduleEndMessage);
        
        const stopTasks = () => {
            updateTask.stop();
            endTask.stop();
        };
    }

    async archive(){
        var archivesCategory = this.guild.channels.cache.find(channel => channel.name === "archives" && channel.type === ChannelType.GuildCategory);
        if (!archivesCategory) {
            archivesCategory = await this.guild.channels.create({name: "archives", type: ChannelType.GuildCategory});
        }
        if (!archivesCategory) return;
        const discussChannel =  await this.getDiscussChannel()
        await discussChannel?.setParent(archivesCategory.id);
        
        // Clean up the message entries in database
        try {
            await MessageModel.deleteMany({ ctfEventId: this.options.ctfEvent.id });
            console.log(`Cleaned up message records for CTF event: ${this.options.ctfEvent.title}`);
        } catch (error) {
            console.error(`Error cleaning up message records: ${error}`);
        }
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
        
        // Save message to database
        await MessageModel.create({
            ctfEventId: this.options.ctfEvent.id,
            messageId: message.id,
            channelId: this.initialChannel.id,
            guildId: this.guild.id,
            expireAt: this.options.ctfEvent.finish
        });
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

// Add a function to restore message listeners on bot restart
export async function restoreEventMessageListeners(client: MyClient) {
    console.log("Restoring event message listeners...")
    try {
        const storedMessages = await MessageModel.find({});
        
        for (const storedMessage of storedMessages) {
            try {
                // Check for valid data
                if (!storedMessage.guildId || !storedMessage.channelId || !storedMessage.messageId || !storedMessage.ctfEventId) {
                    console.error('Invalid stored message data:', storedMessage);
                    continue;
                }
                
                // Fetch guild
                const guild = await client.guilds.fetch(storedMessage.guildId);
                if (!guild) {
                    console.log(`Guild not found: ${storedMessage.guildId}`);
                    continue;
                }
                
                // Fetch channel
                const channel = await guild.channels.fetch(storedMessage.channelId);
                if (!channel || !(channel instanceof TextChannel)) {
                    console.log(`Channel not found or not a text channel: ${storedMessage.channelId}`);
                    continue;
                }
                
                // Fetch message
                try {
                    const message = await channel.messages.fetch(storedMessage.messageId);
                    
                    // Fetch CTF event
                    const ctfEvent = await infoEvent(String(storedMessage.ctfEventId));
                    if (!ctfEvent) {
                        console.log(`CTF event not found: ${storedMessage.ctfEventId}`);
                        continue;
                    }
                    
                    // Create notification role
                    const notificationRole = await createRoleIfNotExist({
                        name: "CTF Waiting Role",
                        guild: guild,
                        color: "#87CEEB"
                    });
                    
                    // Create reaction role event
                    const reactionRoleEvent = new ReactionRoleEvent(guild, channel, {
                        ctfEvent: ctfEvent,
                        notificationRole: notificationRole
                    });
                    
                    // Initialize channels and roles, then add message listener
                    await reactionRoleEvent.__initializeChannelAndRole();
                    await reactionRoleEvent.addMessageRoleEventListener(message);
                    
                    console.log(`Restored event listener for message: ${message.id} (CTF Event: ${ctfEvent.title})`);
                } catch (error: any) {
                    console.error(`Error fetching message: ${error}`);
                    
                    // If message not found, delete the record
                    if (error.code === 10008) { // Discord error code for unknown message
                        await MessageModel.deleteOne({ messageId: storedMessage.messageId });
                        console.log(`Deleted record for missing message: ${storedMessage.messageId}`);
                    }
                }
            } catch (error) {
                console.error(`Error processing stored message: ${error}`);
            }
        }
    } catch (error) {
        console.error(`Error fetching stored messages: ${error}`);
    }
}
