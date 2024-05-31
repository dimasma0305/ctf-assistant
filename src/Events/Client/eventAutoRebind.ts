import { Event } from "../../Handlers/eventHandler"
import { MyClient } from "../../Model/client";
import { getUpcommingOnlineEvent, infoEvent } from "../../Functions/ctftime-v2";
import { ReactionRoleEvent } from "../../Commands/Public/Ctftime/utils/event";
import { createRoleIfNotExist } from "../../Commands/Public/Ctftime/utils/event_utility";
import { getEventsParticipants } from "../../Functions/ctftime";
import { sleep } from "bun";
import cron from "node-cron"
import { Guild } from "discord.js";

const EVENT_ID_REGEX = /\/event\/(\d+)\//;

export const event: Event = {
    name: "ready",
    once: true,
    async execute(client: MyClient) {
        client.guilds.cache.forEach(async (guild) => {
            const scheduledEvents = await guild.scheduledEvents.fetch()
            scheduledEvents.forEach(async (event) => {
                if (event.isCompleted() || event.isCanceled()) return
                const location = event.entityMetadata?.location
                if (!location) return
                const match = location.match(EVENT_ID_REGEX);
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
            if (guild.name == "TCP1P Server") {
                await runEvents(guild)
                cron.schedule("0 0 * * *", async () => await runEvents(guild));
            }
        })
    },
}

async function runEvents(guild: Guild) {
    const upcomming = await getUpcommingOnlineEvent(7);
    for (const id in upcomming) {
        const scheduledEvents = await guild.scheduledEvents.fetch();
        const ctfEvent = upcomming[id];
        const event = scheduledEvents.find((ev) => {
            const match = ev.url.match(EVENT_ID_REGEX);
            if (!match) return;
            const id = match[1];
            return id == ctfEvent.id.toString();
        });
        if (event) return;
        const participants = await getEventsParticipants(ctfEvent.id.toString());
        await sleep(1000);
        for (const id in participants) {
            if (participants[id] == "TCP1P") {
                const reactionRoleEvent = new ReactionRoleEvent(guild, {
                    ctfEvent: ctfEvent,
                    notificationRole: await createRoleIfNotExist({
                        name: "CTF Waiting Role",
                        guild: guild,
                        color: "#87CEEB"
                    })
                });
                await reactionRoleEvent.addEvent();
                break;
            }
        }
    }
}
