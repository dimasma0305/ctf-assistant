import { Event } from "../../Handlers/eventHandler"
import { MyClient } from "../../Model/client";
import { infoEvent } from "../../Functions/ctftime-v2";
import { ReactionRoleEvent, createRoleIfNotExist, restoreEventMessageListeners } from "../../Commands/Public/Ctftime/utils/event";
import { translate } from "../../Functions/discord-utils";
import { TextChannel } from "discord.js";
import { EventModel } from "../../Database/connect";

const EVENT_ID_REGEX = /\/event\/(\d+)\//;

export const event: Event = {
    name: "clientReady",
    once: true,
    async execute(client: MyClient) {
        // First restore message listeners from database
        await restoreEventMessageListeners(client);
        
        // Then process scheduled events
        client.guilds.cache.forEach(async (guild) => {
            const scheduledEvents = await guild.scheduledEvents.fetch()
            scheduledEvents.forEach(async (event) => {
                if (event.isCompleted() || event.isCanceled()) return
                const location = event.entityMetadata?.location
                const eventName = event.name
                if (!location) return
                const match = location.match(EVENT_ID_REGEX);
                if (!match) return
                const id = match[1]
                const ctfEvent = await infoEvent(id, false)
                const translatedEventName = translate(eventName)
                const channel = guild.channels.cache.find(channel => channel.name === translatedEventName)
                if (!(channel instanceof TextChannel)) return;

                // Save/update event in database
                try {
                    const existingEvent = await EventModel.findOne({ 
                        title: ctfEvent.title,
                        url: ctfEvent.url 
                    });

                    if (!existingEvent) {
                        // Extract organizer name properly - handle both string and object
                        let organizerName = 'Unknown';
                        if (ctfEvent.organizers?.[0]) {
                            const org = ctfEvent.organizers[0];
                            organizerName = typeof org === 'string' ? org : (org.name || 'Unknown');
                        }

                        // Normalize format to lowercase for database enum
                        const formatValue = ctfEvent.format 
                            ? [ctfEvent.format.toLowerCase()] 
                            : ['jeopardy'];

                        const newEvent = new EventModel({
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

                        await newEvent.save();
                        console.log(`💾 Saved CTF event to database: ${ctfEvent.title}`);
                    } else {
                        console.log(`📋 CTF event already exists in database: ${ctfEvent.title}`);
                    }
                } catch (dbError) {
                    console.error(`❌ Failed to save CTF event to database:`, dbError);
                }

                const reactionRoleEvent = new ReactionRoleEvent(guild, channel, {
                    ctfEvent: ctfEvent,
                    notificationRole: await createRoleIfNotExist({
                        name: "CTF Waiting Role",
                        guild: guild,
                        color: "#87CEEB"
                    })
                })
                await reactionRoleEvent.addEvent()
            });
        })
    },
}
