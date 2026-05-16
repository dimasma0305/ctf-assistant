import { Event } from "../../Handlers/eventHandler"
import { MyClient } from "../../Model/client";
import { CTFEvent, infoEvent } from "../../Functions/ctftime-v2";
import { ReactionRoleEvent, createRoleIfNotExist, restoreEventMessageListeners } from "../../Commands/Public/Ctftime/utils/event";
import { translate } from "../../Functions/discord-utils";
import { Guild, TextChannel } from "discord.js";
import { EventModel } from "../../Database/connect";

const EVENT_ID_REGEX = /\/event\/(\d+)\//;
const REBIND_CONCURRENCY = 4;

async function runWithConcurrency<T>(items: T[], limit: number, task: (item: T) => Promise<void>): Promise<void> {
    if (items.length === 0) return;
    const queue = [...items];
    const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
        while (queue.length) {
            const item = queue.shift();
            if (item === undefined) break;
            await task(item);
        }
    });
    await Promise.all(workers);
}

async function persistEventIfMissing(ctfEvent: CTFEvent) {
    try {
        const existingEvent = await EventModel.findOne({
            title: ctfEvent.title,
            url: ctfEvent.url
        }, { _id: 1 }).lean();

        if (existingEvent) {
            console.log(`📋 CTF event already exists in database: ${ctfEvent.title}`);
            return;
        }

        let organizerName = 'Unknown';
        if (ctfEvent.organizers?.[0]) {
            const org: any = ctfEvent.organizers[0];
            organizerName = typeof org === 'string' ? org : (org.name || 'Unknown');
        }

        const formatValue = ctfEvent.format
            ? [ctfEvent.format.toLowerCase()]
            : ['jeopardy'];

        await EventModel.create({
            title: ctfEvent.title,
            organizer: organizerName,
            description: ctfEvent.description || '',
            url: ctfEvent.url,
            logo: ctfEvent.logo,
            restrictions: [],
            format: formatValue,
            timelines: [{
                name: 'Main Event',
                startTime: new Date(ctfEvent.start),
                endTime: new Date(ctfEvent.finish),
                location: 'Online',
                timezone: 'WIB'
            }]
        });
        console.log(`💾 Saved CTF event to database: ${ctfEvent.title}`);
    } catch (dbError) {
        console.error(`❌ Failed to save CTF event to database:`, dbError);
    }
}

interface RebindJob {
    guild: Guild;
    scheduledEvent: any;
    ctfId: string;
}

export const event: Event = {
    name: "ready",
    once: true,
    async execute(client: MyClient) {
        // First restore message listeners from database (now parallelized inside).
        await restoreEventMessageListeners(client);

        // Collect all rebind jobs first so we can dedupe + bound concurrency
        // across all guilds, instead of fan-out without backpressure.
        const jobs: RebindJob[] = [];
        const guilds = Array.from(client.guilds.cache.values());

        await runWithConcurrency(guilds, REBIND_CONCURRENCY, async (guild) => {
            try {
                const scheduledEvents = await guild.scheduledEvents.fetch();
                for (const sEvent of scheduledEvents.values()) {
                    if (sEvent.isCompleted() || sEvent.isCanceled()) continue;
                    const location = sEvent.entityMetadata?.location;
                    if (!location) continue;
                    const match = location.match(EVENT_ID_REGEX);
                    if (!match) continue;
                    jobs.push({ guild, scheduledEvent: sEvent, ctfId: match[1] });
                }
            } catch (error) {
                console.error(`Failed to fetch scheduled events for guild ${guild.id}:`, error);
            }
        });

        // Dedupe infoEvent calls — many guilds can reference the same ctf_id.
        const uniqueIds = Array.from(new Set(jobs.map((j) => j.ctfId)));
        const ctfEventCache = new Map<string, CTFEvent>();
        await runWithConcurrency(uniqueIds, REBIND_CONCURRENCY, async (id) => {
            try {
                const ctfEvent = await infoEvent(id, false);
                ctfEventCache.set(id, ctfEvent);
            } catch (error) {
                console.error(`Failed to fetch CTF event ${id}:`, error);
            }
        });

        // Persist new EventModel docs in parallel-bounded fashion.
        await runWithConcurrency(Array.from(ctfEventCache.values()), REBIND_CONCURRENCY, async (ctfEvent) => {
            await persistEventIfMissing(ctfEvent);
        });

        await runWithConcurrency(jobs, REBIND_CONCURRENCY, async ({ guild, scheduledEvent, ctfId }) => {
            try {
                const ctfEvent = ctfEventCache.get(ctfId);
                if (!ctfEvent) return;

                const translatedEventName = translate(scheduledEvent.name);
                const channel = guild.channels.cache.find((c) => c.name === translatedEventName);
                if (!(channel instanceof TextChannel)) return;

                const reactionRoleEvent = new ReactionRoleEvent(guild, channel, {
                    ctfEvent,
                    notificationRole: await createRoleIfNotExist({
                        name: "CTF Waiting Role",
                        guild,
                        color: "#87CEEB"
                    })
                });
                await reactionRoleEvent.addEvent();
            } catch (error) {
                console.error(`Failed to rebind event ${ctfId} in guild ${guild.id}:`, error);
            }
        });
    },
}
