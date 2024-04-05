import { Event } from "../../Handlers/eventHandler"
import { MyClient } from "../../Model/client";
import { infoEvent } from "../../Functions/ctftime-v2";
import { ReactionRoleEvent } from "../../Commands/Public/Ctftime/utils/event";
import { createRoleIfNotExist } from "../../Commands/Public/Ctftime/utils/event_utility";

export const event: Event = {
    name: "ready",
    once: true,
    async execute(client: MyClient) {
        client.guilds.cache.forEach((guild)=>{
            guild.scheduledEvents.cache.forEach(async (event) => {
                console.log(event)
                if (event.isCompleted() && event.isCanceled()) return
                const location = event.entityMetadata?.location
                if (!location) return
                const regex = /\/event\/(\d+)\//;
                const match = location.match(regex);
                if (!match) return
                const id = match[1]
                const ctfEvent = await infoEvent(id)
                const reactionRoleEvent = new ReactionRoleEvent(guild, {
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
