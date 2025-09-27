import { EventSchemaType } from "./Database/connect";
import express from "express";
import { EventModel } from "./Database/connect";
import { GuildScheduledEventEntityType, GuildScheduledEventPrivacyLevel } from "discord.js";
import client from "./client";
import { sleep } from "bun";


export async function getTCP1P() {
    let tcp1p = client.guilds.cache.find((g) => g.name == "TCP1P Server");
    while (true) {
        if (!tcp1p) {
            console.log("There's no TCP1P?");
            tcp1p = client.guilds.cache.find((g) => g.name == "TCP1P Server");
        } else {
            break;
        }
        await sleep(1000);
    }
    return tcp1p;
}

async function updateDiscordEvents(id: string) {
    try {
        const event = await EventModel.findById(id);

        if (!event) {
            return;
        }

        const now = new Date();

        for (const i in event.timelines) {
            const name = event.timelines[i].name;
            const timezone = event.timelines[i].timezone;
            if (!timezone || !event.timelines[i].startTime || !event.timelines[i].endTime) return;
            let startTime = formatTimezone(event.timelines[i].startTime, timezones[timezone]);
            const endTime = formatTimezone(event.timelines[i].endTime, timezones[timezone]);
            const discordEventId = event.timelines[i].discordEventId;

            if (!name || !startTime || !endTime) {
                continue;
            }

            if (new Date(startTime) < now || new Date(endTime) < now) {
                if (new Date(endTime) < now) continue;
                if (new Date(startTime) < now) startTime = formatTimezone(new Date(Date.now()+30*1000), new Date().getTimezoneOffset())
            }

            const eventOptions = {
                name: `${event.title} - ${name}`,
                scheduledStartTime: startTime,
                scheduledEndTime: endTime,
                privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
                entityType: GuildScheduledEventEntityType.External,
                description: `${event.description?.substring(0, 800)}

:busts_in_silhouette: **Organizers**
${event.organizer}

:gear: **Format**
${event.format}

:link: **URL**
${event.url}`,
                image: event.logo,
                entityMetadata: {
                    location: event.timelines[i].location
                }
            };
            const tcp1p = await getTCP1P();
            if (!tcp1p) return;
            if (discordEventId) {
                const discordEvent = tcp1p.scheduledEvents.cache.find((scheduledEvent) => scheduledEvent.id == discordEventId);
                if (discordEvent) {
                    await discordEvent.edit(eventOptions);
                } else {
                    const newDiscordEvent = await tcp1p.scheduledEvents.create(eventOptions);
                    event.timelines[i].discordEventId = newDiscordEvent.id;
                }
            } else {
                const newDiscordEvent = await tcp1p.scheduledEvents.create(eventOptions);
                event.timelines[i].discordEventId = newDiscordEvent.id;
            }
        }
        await event.save();
    } catch (error) {
        console.error(error);
    }
}

export async function deleteEvents(id: string) {
    const event = await EventModel.findById(id).exec();
    const tcp1p = await getTCP1P();
    if (event) {
        for (const timeline of event.timelines) {
            const discordEventId = timeline.discordEventId;
            if (discordEventId && tcp1p) {
                const discordEvent = tcp1p.scheduledEvents.cache.find((scheduledEvent) => scheduledEvent.id === discordEventId);
                if (discordEvent) {
                    await discordEvent.delete().catch(console.error);
                }
            }
        }
        await EventModel.findByIdAndDelete(id).exec();
    }
}

async function deleteEvent(discordEventId: string){
    const tcp1p = await getTCP1P();
    const discordEvent = tcp1p.scheduledEvents.cache.find((scheduledEvent) => scheduledEvent.id === discordEventId);
    if (discordEvent) {
        await discordEvent.delete().catch(console.error);
    }
}

function isDate(date: string): boolean {
    try {
        new Date(date).toISOString();
        return true;
    } catch {
        return false;
    }
}

export async function reqToForm(req: express.Request): Promise<EventSchemaType | undefined> {
    if (typeof req.params.id != "string"){
        return
    }
    let event = await EventModel.findById(req.params.id);
    if (!(req.body.timelineName instanceof Array)) {
        return;
    }
    const timelines = req.body.timelineName.map((name: any, index: number) => {
        if (typeof index != "number") {
            return;
        }
        let resp: any = {};
        try {
            const timelineStart = req.body.timelineStart[index];
            const timelineEnd = req.body.timelineEnd[index];
            let startTime;
            let endTime;
            if (isDate(timelineStart)) startTime = new Date(timelineStart).toISOString();
            if (isDate(timelineEnd)) endTime = new Date(timelineEnd).toISOString();
            let discordEventId = null;
            if (event && event.timelines && event.timelines[index]) {
                discordEventId = event.timelines[index].discordEventId;
            }
            resp = {
                name,
                startTime,
                endTime,
                discordEventId,
                timezone: req.body.timezone ? req.body.timezone[index] : undefined,
                location: req.body.location ? req.body.location[index] : undefined
            };
        } catch (error) {
            console.log(error);
            return;
        }
        return resp;
    }).filter((item: any) => item !== undefined);
    return {
        organizer: req.body.organizer,
        description: req.body.description,
        title: req.body.title,
        url: req.body.url,
        restrictions: req.body.restrictions,
        format: req.body.format,
        logo: req.body.logo,
        timelines,
    }
}

export const formatTimezone = (datetime: Date, offset: number): string => {
    const sign = offset >= 0 ? '+' : '-';
    const absOffset = Math.abs(offset);
    const formattedOffset = `${sign}${absOffset.toString().padStart(2, '0')}00`;

    return `${datetime.toUTCString()}${formattedOffset}`;
};

export const timezones: { [key: string]: number } = {
    'WIB': 7,
    'WITA': 8,
    'WIT': 9
};

export async function sanitizeEvents() {

    const events = await EventModel.find().sort({ "timelines.startTime": 1 }).lean().exec();

    const sanitizedEvents = events.map(event => {
        const { _id, ...rest } = event;

        const sanitizedTimelines = rest.timelines.map(timeline => {
            if (!timeline.timezone || !timeline.startTime || !timeline.endTime) {
                return;
            }
            const { _id, discordEventId, ...timelineRest } = timeline;
            const offset = timezones[timeline.timezone];
            return {
                ...timelineRest,
                startTime: formatTimezone(timeline.startTime, offset),
                endTime: formatTimezone(timeline.endTime, offset)
            };
        }).filter(val => val !== undefined);

        return { ...rest, timelines: sanitizedTimelines };
    });
    return sanitizedEvents;
}

export async function updateOrDeleteEvents(req: express.Request) {
    const form = await reqToForm(req);
    const id = req.params.id
    if (!form || typeof id != "string") {
        return;
    }
    const event = await EventModel.findById(id);
    await EventModel.findByIdAndUpdate(id, form)
    const newTimelines = form.timelines;
    if (event && newTimelines.length != event.timelines.length) {
        for (const i in event.timelines) {
            if (newTimelines[i] == undefined) {
                if (event.timelines[i]?.discordEventId){
                    await deleteEvent(event.timelines[i].discordEventId);
                }
            }
        }
    }

    await updateDiscordEvents(req.params.id);
}
