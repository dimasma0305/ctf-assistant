import { Event } from "../../Handlers/eventHandler"
import { MyClient } from "../../Model/client";
import { infoEvent } from "../../Functions/ctftime-v2";
import { ReactionRoleEvent, createRoleIfNotExist, restoreEventMessageListeners } from "../../Commands/Public/Ctftime/utils/event";
import { translate } from "../../Functions/discord-utils";
import { TextChannel } from "discord.js";

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
                const ctfEvent = await infoEvent(id)
                 const translatedEventName = translate(eventName)
                 const channel = guild.channels.cache.find(channel => channel.name === translatedEventName)
                if (!(channel instanceof TextChannel)) return;

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
