import { ActionRowBuilder, APIActionRowComponent, APIMessageActionRowComponent, ButtonBuilder, ButtonStyle, CacheType, ChatInputCommandInteraction, ComponentType, DMChannel, Guild, GuildMember, GuildScheduledEvent, GuildScheduledEventEntityType, GuildScheduledEventPrivacyLevel, JSONEncodable, Message, PartialGuildScheduledEvent, RESTJSONErrorCodes, Role, TextChannel, User } from "discord.js";

import { CTFEvent, infoEvent } from "../../../../Functions/ctftime-v2";
import { MessageModel } from "../../../../Database/connect";

const ENV = process.env.ENV || 'production';

import { ChannelType, ColorResolvable } from "discord.js";
import { translate } from "../../../../Functions/discord-utils";

const LOG_PREFIX = '[ReactionRoleEvent]';

function logInfo(message: string, meta?: Record<string, unknown>) {
    if (meta) {
        console.log(`${LOG_PREFIX} ${message}`, meta);
        return;
    }
    console.log(`${LOG_PREFIX} ${message}`);
}

function logWarn(message: string, meta?: Record<string, unknown>) {
    if (meta) {
        console.warn(`${LOG_PREFIX} ${message}`, meta);
        return;
    }
    console.warn(`${LOG_PREFIX} ${message}`);
}

function logError(message: string, error: unknown, meta?: Record<string, unknown>) {
    const payload = meta ? { ...meta, error } : { error };
    console.error(`${LOG_PREFIX} ${message}`, payload);
}

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
import { CTFCacheModel, FetchCommandModel } from "../../../../Database/connect";

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


type DMMessagePayload = Parameters<DMChannel['send']>[0];

function buildMabarNotification(ctfEvent: CTFEvent): DMMessagePayload {
    return {
        embeds: [{
            title: "🎮 Notifikasi Mabar TCP1P",
            description: `Hai teman-teman yang luar biasa!

Aku punya kabar seru nih! 🥳🎉 Kita akan mabar ${ctfEvent.title}! 💃🕹️ Jangan lupa cek info lengkapnya di <#1008578079016370246> ya!

Ayo semangat belajar bareng-bareng dan tingkatkan skill cyber security kita di CTF kali ini! 🚀💻 Jangan sampe kelewat, ya! ❤️`
        }]
    };
}

async function sendSequentialDMs(dmChannel: DMChannel, messages: DMMessagePayload[]): Promise<void> {
    for (const message of messages) {
        await dmChannel.send(message);
    }
}

async function runWithConcurrency<T>(items: T[], limit: number, task: (item: T) => Promise<void>): Promise<void> {
    const queue = [...items];
    const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
        while (queue.length) {
            const item = queue.shift();
            if (!item) break;
            await task(item);
        }
    });
    await Promise.all(workers);
}

function isDiscordApiError(error: unknown): error is { code: number } {
    return typeof error === 'object' && error !== null && 'code' in error;
}

async function openDMChannel(user: User): Promise<DMChannel | null> {
    if (user.dmChannel) {
        return user.dmChannel;
    }

    try {
        return await user.createDM();
    } catch (error) {
        if (isDiscordApiError(error) && error.code === RESTJSONErrorCodes.CannotSendMessagesToThisUser) {
            logWarn('User has DMs disabled or blocked the bot', {
                userId: user.id,
                username: `${user.username}#${user.discriminator}`,
            });
            return null;
        }

        logError('Unexpected error while creating DM channel', error, {
            userId: user.id,
            username: `${user.username}#${user.discriminator}`,
        });
        return null;
    }
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

/**
 * Global registry of active ReactionRoleEvent instances keyed by the
 * Discord scheduled-event ID. Lets us route `guildScheduledEventUserAdd`
 * and `…UserRemove` to the right handler without per-event polling.
 */
const activeEventHandlers = new Map<string, ReactionRoleEvent>();
let discordEventListenersAttached = false;
let reconcileInterval: ReturnType<typeof setInterval> | null = null;

const RECONCILE_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes safety-net

function attachDiscordEventListeners(guild: Guild) {
    if (discordEventListenersAttached) return;
    discordEventListenersAttached = true;

    const client = guild.client;

    client.on('guildScheduledEventUserAdd', (scheduledEvent: GuildScheduledEvent | PartialGuildScheduledEvent, user: User) => {
        const handler = activeEventHandlers.get(scheduledEvent.id);
        if (!handler) return;
        handler.handleSubscriberAdd(user).catch((error) => {
            logError('Error handling scheduled-event user add', error, {
                scheduledEventId: scheduledEvent.id,
                userId: user.id,
            });
        });
    });

    client.on('guildScheduledEventUserRemove', (scheduledEvent: GuildScheduledEvent | PartialGuildScheduledEvent, user: User) => {
        const handler = activeEventHandlers.get(scheduledEvent.id);
        if (!handler) return;
        handler.handleSubscriberRemove(user).catch((error) => {
            logError('Error handling scheduled-event user remove', error, {
                scheduledEventId: scheduledEvent.id,
                userId: user.id,
            });
        });
    });

    // Safety-net reconciliation in case we miss gateway events (restart, drop).
    reconcileInterval = setInterval(async () => {
        for (const handler of activeEventHandlers.values()) {
            try {
                await handler.reconcileSubscribers();
            } catch (error) {
                logError('Error during periodic subscriber reconciliation', error, {
                    eventTitle: handler.options.ctfEvent.title,
                });
            }
        }
    }, RECONCILE_INTERVAL_MS);
}

export class ReactionRoleEvent {
    guild: Guild;
    initialChannel: TextChannel;
    options: EventListenerOptions;
    discussChannel?: TextChannel;
    role?: Role;
    private initializationTask?: Promise<void>;
    constructor(guild: Guild, initialChannel: TextChannel, options: EventListenerOptions) {
        this.options = options
        this.guild = guild
        this.initialChannel = initialChannel
    }
    private async performInitialization() {
        const ctfName = this.options.ctfEvent.title
        const role = await this.createEventRoleIfNotExist(ctfName)
        this.role = role
        this.discussChannel = await this.createDefaultChannelIfNotExist(ctfName, role, async (channel) => {
            const credsMessage = await channel.send({
                content: `
# 🎉 Selamat Datang di Ruang Diskusi ${ctfName}!

<@&${role.id}> **Mari kolaborasi dan belajar bersama!** 💻✨

## 🔑 **Manajemen Kredensial**
⚠️ **PENTING:**  
1. Buat credential dengan format:  
   \`\`\`md
   # Credential
   [Nama Tim/Individu] : [Password/Token]
   Link: <LINK>
   \`\`\`
2. Posting credential di channel ini **SAJA** (channel privat)
3. Update credential jika ada perubahan

> 🛡️ Channel ini hanya bisa diakses anggota <@&${role.id}>!

## 🛠️ Command Solve 
\`\`\`bash
# Auto-detect nama challenge dari thread
/solve challenge players:@partisipan1 @partisipan2

# Initialize challenges dari platform CTF
/solve init fetch_command:'fetch("<URL>", {method: "GET", headers: {Authorization: "Bearer <TOKEN>"}})'

\`\`\`

## 📡 **CTF Platform JSON Endpoints**
🔗 **Untuk auto-import challenges:**
- **CTFd:** \`/api/v1/challenges\`
- **rCTF:** \`/api/v1/challs\`  
- **GzCTF:** \`/api/game/{id}/challenges\`
- **picoCTF:** \`/api/challenges\`
- **Contoh:** \`https://ctf.example.com/api/v1/challenges\`

> 💡 Copy JSON dari endpoint tersebut, lalu gunakan \`/solve init\`
            `.trim()
            })
            credsMessage.pin('Panduan Resmi CTF');
            try {
                await this.sendNotification()
            } catch (error) {
                logError('Failed to send notification to members', error, {
                    roleId: role.id,
                    eventId: this.options.ctfEvent.id,
                })
            }
        })

    }
    async __initializeChannelAndRole() {
        if (!this.initializationTask) {
            this.initializationTask = this.performInitialization();
        }
        return this.initializationTask;
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
            data: { id: this.options.ctfEvent.id },
            callback: callback
        })
    }
    async getDiscussChannel() {
        const channels = await this.guild.channels.fetch()
        const name = translate(this.options.ctfEvent.title)
        var channel = channels.find((channel) => channel?.name === name) as TextChannel
        if (!(channel instanceof TextChannel)) return
        return channel
    }
    async createEventIfNotExist() {
        var event = this.guild.scheduledEvents.cache.find((event) => event.name === this.options.ctfEvent.title && !event.isCanceled() && !event.isCompleted())

        if (!event) {
            const description = this.options.ctfEvent.description.substr(0, 800)
            const ctftimeUrl = this.options.ctfEvent.ctftime_url
            const url = this.options.ctfEvent.url
            const organizers = this.options.ctfEvent.organizers
            const format = this.options.ctfEvent.format
            const weight = this.options.ctfEvent.weight
            var startTime = this.options.ctfEvent.start
            if (startTime.getTime() < new Date().getTime()) {
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
${organizers.map((organizer) => organizer.name).join("\n")}

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
            const mabarChannel = this.guild.channels.cache.find((channel) => channel.name.includes("mabar-ctf")) as TextChannel
            if (mabarChannel) {
                await mabarChannel.send(`${event.url}`)
                await mabarChannel.send(`Halo teman-teman <@&${this.options.notificationRole?.id}> silahkan yang mau ikut mabar ${this.options.ctfEvent.title} bisa klik interest diatas ya XP`)
            }
        }
        return event
    }
    async addRoleToUser(iuser: User) {
        const role = await this.getRole()
        let member: GuildMember | null = null
        try {
            member = await this.guild.members.fetch(iuser.id)
        } catch (error) {
            logError('Failed to fetch guild member during role assignment', error, {
                userId: iuser.id,
                eventId: this.options.ctfEvent.id,
            })
            return false
        }
        if (member.roles.cache.has(role.id)) return false
        await member.roles.add(role)
        return true
    }
    async removeRoleFromUser(iuser: User) {
        const role = await this.getRole()
        let member: GuildMember | null = null
        try {
            member = await this.guild.members.fetch(iuser.id)
        } catch (error) {
            logError('Failed to fetch guild member during role removal', error, {
                userId: iuser.id,
                eventId: this.options.ctfEvent.id,
            })
            return false
        }
        if (member.roles.cache.has(role.id)) {
            await member.roles.remove(role)
            return true
        }
        return false
    }
    private scheduledEvent?: GuildScheduledEvent;
    private knownSubscribers: Set<string> = new Set();
    private endTimeout?: ReturnType<typeof setTimeout>;

    async addEvent() {
        await this.__initializeChannelAndRole()
        const role = await this.getRole()
        const event = await this.createEventIfNotExist()
        if (!event) {
            logWarn('Unable to create or fetch scheduled event', {
                eventTitle: this.options.ctfEvent.title,
            })
            return
        }
        this.scheduledEvent = event;

        // Initial sync — assign the role to anyone already subscribed.
        const initialSubs = await event.fetchSubscribers({ withMember: true });
        this.knownSubscribers = new Set(initialSubs.map((s) => s.user.id));

        await runWithConcurrency(Array.from(initialSubs.values()), 5, async (gUser) => {
            const member = gUser.member ?? await this.guild.members.fetch(gUser.user.id).catch((error) => {
                logError('Failed to fetch member while syncing subscribers (initial)', error, {
                    userId: gUser.user.id,
                    eventId: this.options.ctfEvent.id,
                })
                return null
            })
            if (!member || member.roles.cache.has(role.id)) return
            const wasAdded = await this.addRoleToUser(gUser.user)
            if (wasAdded) {
                const dm = await openDMChannel(gUser.user)
                if (dm) {
                    await this.sendSuccessMessage(dm)
                }
            }
        })

        // Register for native Discord gateway events instead of polling every 5s.
        attachDiscordEventListeners(this.guild);
        activeEventHandlers.set(event.id, this);

        // Schedule end-of-event using setTimeout (cap at int32 max ~24.8 days,
        // re-schedule beyond that). Far more reliable than a cron pattern derived
        // from a date — it won't silently miss the firing minute.
        this.scheduleEnd();
    }

    private scheduleEnd() {
        const MAX_TIMEOUT = 2147483647;
        const ms = this.options.ctfEvent.finish.getTime() - Date.now();
        if (ms <= 0) {
            void this.handleEnd();
            return;
        }
        this.endTimeout = setTimeout(() => {
            if (Date.now() < this.options.ctfEvent.finish.getTime()) {
                this.scheduleEnd();
                return;
            }
            void this.handleEnd();
        }, Math.min(ms, MAX_TIMEOUT));
    }

    private async handleEnd() {
        const role = await this.getRole();
        const endMessage = await generateCtfEndMessage(this.options.ctfEvent.title, role.id);
        let finalMessage = endMessage;

        try {
            const ctfCache = await CTFCacheModel.findOne({ ctf_id: this.options.ctfEvent.id.toString() }, { _id: 1 }).lean();
            if (ctfCache && this.discussChannel) {
                const fetchCmd = await FetchCommandModel.findOne({
                    ctf: ctfCache._id,
                    channel_id: this.discussChannel.id,
                }, { _id: 1 }).lean();

                if (!fetchCmd) {
                    finalMessage += `\n\n⚠️ **Final Score Reminder:** Jalankan \`/solve init\` lagi di channel ini setelah CTF selesai untuk refresh data (points/solves) supaya scoreboard final akurat.`;
                }
            }
        } catch (error) {
            logWarn('Failed to check fetch command status for end reminder', {
                eventId: this.options.ctfEvent.id,
                error,
            });
        }

        await this.discussChannel?.send(finalMessage);
        this.stop();
        await this.archive();
    }

    private stop() {
        if (this.endTimeout) {
            clearTimeout(this.endTimeout);
            this.endTimeout = undefined;
        }
        if (this.scheduledEvent) {
            activeEventHandlers.delete(this.scheduledEvent.id);
        }
    }

    /** Called from the global guildScheduledEventUserAdd listener. */
    async handleSubscriberAdd(user: User) {
        this.knownSubscribers.add(user.id);
        const wasAdded = await this.addRoleToUser(user);
        if (!wasAdded) return;
        const dm = await openDMChannel(user);
        if (dm) await this.sendSuccessMessage(dm);
    }

    /** Called from the global guildScheduledEventUserRemove listener. */
    async handleSubscriberRemove(user: User) {
        this.knownSubscribers.delete(user.id);
        const wasRemoved = await this.removeRoleFromUser(user);
        if (!wasRemoved) return;
        const dm = await openDMChannel(user);
        if (dm) await dm.send(`Successfully removed the role for "${this.options.ctfEvent.title}"`);
    }

    /** Safety-net periodic reconciliation against the gateway events. */
    async reconcileSubscribers() {
        if (!this.scheduledEvent) return;
        const role = await this.getRole();
        const subs = await this.scheduledEvent.fetchSubscribers({ withMember: true });
        const currentIds = new Set(subs.map((s) => s.user.id));

        // Adds we missed
        for (const sub of subs.values()) {
            if (this.knownSubscribers.has(sub.user.id)) continue;
            const member = sub.member ?? await this.guild.members.fetch(sub.user.id).catch(() => null);
            if (!member || member.roles.cache.has(role.id)) {
                this.knownSubscribers.add(sub.user.id);
                continue;
            }
            await this.handleSubscriberAdd(sub.user);
        }

        // Removes we missed — snapshot to a list so handleSubscriberRemove
        // can safely mutate knownSubscribers during iteration.
        for (const knownId of Array.from(this.knownSubscribers)) {
            if (currentIds.has(knownId)) continue;
            const member = await this.guild.members.fetch(knownId).catch(() => null);
            if (!member) {
                this.knownSubscribers.delete(knownId);
                continue;
            }
            await this.handleSubscriberRemove(member.user);
        }
    }

    async archive() {
        var archivesCategory = this.guild.channels.cache.find(channel => channel.name === "archives" && channel.type === ChannelType.GuildCategory);
        if (!archivesCategory) {
            archivesCategory = await this.guild.channels.create({ name: "archives", type: ChannelType.GuildCategory });
        }
        if (!archivesCategory) return;
        const discussChannel = await this.getDiscussChannel()
        await discussChannel?.setParent(archivesCategory.id);

        // Clean up the message entries in database
        try {
            await MessageModel.deleteMany({ ctfEventId: this.options.ctfEvent.id });
            logInfo('Cleaned up message records for CTF event', {
                eventTitle: this.options.ctfEvent.title,
            });
        } catch (error) {
            logError('Error cleaning up message records', error, {
                eventTitle: this.options.ctfEvent.title,
            });
        }
    }

    async addMessageRoleEventListener(msg: Message) {
        await this.__initializeChannelAndRole()
        // Calculate timeout duration, cap at max safe 32-bit signed integer (2147483647 ms = ~24.8 days)
        const timeUntilFinish = this.options.ctfEvent.finish.getTime() - new Date().getTime();
        const MAX_TIMEOUT = 2147483647; // Maximum safe timeout in milliseconds
        if (timeUntilFinish <= 0) {
            logInfo('Skipping message listener for finished CTF event', {
                messageId: msg.id,
                eventId: this.options.ctfEvent.id,
                eventTitle: this.options.ctfEvent.title,
            });
            return;
        }

        const collectorTimeout = Math.min(timeUntilFinish, MAX_TIMEOUT);

        const collector = msg.createMessageComponentCollector({
            filter: async (i) => {
                await i.deferUpdate()
                return i.user.id ? true : false
            },
            time: collectorTimeout,
            componentType: ComponentType.Button,
        })

        collector.on("collect", async (interaction) => {
            if (interaction.customId == "join") {
                if (await this.addRoleToUser(interaction.user)) {
                    const dm = await openDMChannel(interaction.user)
                    if (dm) {
                        await this.sendSuccessMessage(dm)
                    }
                }
            } else if (interaction.customId == "leave") {
                if (await this.removeRoleFromUser(interaction.user)) {
                    const dm = await openDMChannel(interaction.user)
                    if (dm) {
                        await dm.send(`Successfully remove the role for "${this.options.ctfEvent.title}"`)
                    }
                }
            }
        })

        // If the event duration exceeds max timeout, renew the collector when it expires
        collector.on("end", async (collected, reason) => {
            if (reason === "time" && new Date().getTime() < this.options.ctfEvent.finish.getTime()) {
                logInfo('Collector timed out, renewing listener', {
                    messageId: msg.id,
                    eventId: this.options.ctfEvent.id,
                });
                await this.addMessageRoleEventListener(msg);
            }
        })
    }

    async createMessageForRole() {
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
        if (!this.role) {
            await this.__initializeChannelAndRole()
        }
        if (!this.role) {
            throw new Error(`Failed to initialize role for event ${this.options.ctfEvent.title}`)
        }
        return this.role
    }

    async sendNotification() {
        const notificationRole = this.options.notificationRole
        if (!notificationRole) {
            return
        }

        const members = Array.from(notificationRole.members.values())
        if (members.length === 0) {
            logWarn('No members found for notification role, skipping dispatch', {
                roleId: notificationRole.id,
                eventId: this.options.ctfEvent.id,
            })
            return
        }

        const mabarNotification = buildMabarNotification(this.options.ctfEvent)

        const concurrencyLimit = Math.min(5, members.length)

        await runWithConcurrency(members, Math.max(concurrencyLimit, 1), async (member) => {
            const dmChannel = await openDMChannel(member.user)
            if (!dmChannel) return

            try {
                await dmChannel.send(mabarNotification)
            } catch (error) {
                logError('Failed to send notification DM', error, {
                    roleId: notificationRole.id,
                    memberTag: `${member.user.username}#${member.user.discriminator}`,
                    eventId: this.options.ctfEvent.id,
                })
            }
        })
    }

    sendFailureMessage(dmChannel: DMChannel) {
        return sendSequentialDMs(dmChannel, [{
            content: `Authentication failed. Please provide the correct password to proceed.`,
        }]);
    }
    sendSuccessMessage(dmChannel: DMChannel) {
        const discussChannelMessage = this.discussChannel ? {
            embeds: [{
                fields: [
                    { name: "**Discuss Channel**", value: `<#${this.discussChannel.id}>` },
                ]
            }]
        } : undefined

        const messages: DMMessagePayload[] = [
            { content: `Successfully added the role for "${this.options.ctfEvent.title}"!` },
            { content: `Here's the channel for the CTF event. Good luck!` },
        ]

        if (discussChannelMessage) {
            messages.push(discussChannelMessage)
        }

        return sendSequentialDMs(dmChannel, messages)
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

const RESTORE_CONCURRENCY = 5;

// Add a function to restore message listeners on bot restart
export async function restoreEventMessageListeners(client: MyClient) {
    logInfo("Restoring event message listeners...")
    try {
        const storedMessages = await MessageModel.find({}).lean();
        const now = Date.now();

        // Up-front cleanup: drop expired records in one query.
        const expiredIds = storedMessages
            .filter((m: any) => m.expireAt && new Date(m.expireAt).getTime() <= now)
            .map((m: any) => m._id);
        if (expiredIds.length > 0) {
            await MessageModel.deleteMany({ _id: { $in: expiredIds } });
        }

        const candidates = storedMessages.filter((m: any) => {
            if (!m.guildId || !m.channelId || !m.messageId || !m.ctfEventId) return false;
            if (m.expireAt && new Date(m.expireAt).getTime() <= now) return false;
            return true;
        });

        // Dedupe ctfEventIds → one infoEvent call each, shared across guilds.
        const uniqueCtfIds = Array.from(new Set(candidates.map((m: any) => String(m.ctfEventId))));
        const ctfEventCache = new Map<string, any>();
        await Promise.all(uniqueCtfIds.map(async (id) => {
            try {
                const ctfEvent = await infoEvent(id);
                if (ctfEvent) ctfEventCache.set(id, ctfEvent);
            } catch (error) {
                logWarn('Failed to resolve CTF event while restoring listeners', { ctfEventId: id, error });
            }
        }));

        // Drop records whose CTF has already ended (the cron-based scheduler is
        // gone now, but the listener would still attach a no-op collector).
        const staleIds = candidates
            .filter((m: any) => {
                const e = ctfEventCache.get(String(m.ctfEventId));
                return e && e.finish && new Date(e.finish).getTime() <= now;
            })
            .map((m: any) => m._id);
        if (staleIds.length > 0) {
            await MessageModel.deleteMany({ _id: { $in: staleIds } });
        }

        const live = candidates.filter((m: any) => {
            const e = ctfEventCache.get(String(m.ctfEventId));
            return e && e.finish && new Date(e.finish).getTime() > now;
        });

        const queue = [...live];
        const workers = Array.from({ length: Math.min(RESTORE_CONCURRENCY, queue.length) }, async () => {
            while (queue.length) {
                const storedMessage: any = queue.shift();
                if (!storedMessage) break;
                try {
                    const guild = await client.guilds.fetch(storedMessage.guildId).catch(() => null);
                    if (!guild) {
                        logWarn('Guild not found while restoring listener', {
                            guildId: storedMessage.guildId,
                            messageId: storedMessage.messageId,
                        });
                        continue;
                    }
                    const channel = await guild.channels.fetch(storedMessage.channelId).catch(() => null);
                    if (!channel || !(channel instanceof TextChannel)) {
                        logWarn('Channel not found or not a text channel while restoring listener', {
                            channelId: storedMessage.channelId,
                            guildId: storedMessage.guildId,
                            messageId: storedMessage.messageId,
                        });
                        continue;
                    }
                    let message;
                    try {
                        message = await channel.messages.fetch(storedMessage.messageId);
                    } catch (error: any) {
                        logError('Error fetching stored message while restoring listener', error, {
                            messageId: storedMessage.messageId,
                            guildId: storedMessage.guildId,
                        });
                        if (error?.code === 10008) {
                            await MessageModel.deleteOne({ messageId: storedMessage.messageId });
                            logInfo('Deleted record for missing message', { messageId: storedMessage.messageId });
                        }
                        continue;
                    }

                    const ctfEvent = ctfEventCache.get(String(storedMessage.ctfEventId));
                    const notificationRole = await createRoleIfNotExist({
                        name: "CTF Waiting Role",
                        guild,
                        color: "#87CEEB"
                    });
                    const reactionRoleEvent = new ReactionRoleEvent(guild, channel, {
                        ctfEvent,
                        notificationRole
                    });
                    await reactionRoleEvent.__initializeChannelAndRole();
                    await reactionRoleEvent.addMessageRoleEventListener(message);
                    logInfo('Restored event listener', {
                        messageId: message.id,
                        ctfEventTitle: ctfEvent.title,
                    });
                } catch (error) {
                    logError('Error processing stored message during listener restore', error, {
                        storedMessageId: storedMessage._id?.toString?.(),
                    });
                }
            }
        });
        await Promise.all(workers);
    } catch (error) {
        logError('Error fetching stored messages', error);
    }
}
