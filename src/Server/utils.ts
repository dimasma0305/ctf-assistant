import { Session } from "express-session";
import { EventSchemaType } from "../Database/eventSchema";
import express, { NextFunction, Response, Request } from "express";
import { EventModel } from "../Database/connect";
import { GuildScheduledEventEntityType, GuildScheduledEventPrivacyLevel } from "discord.js";
import client from "../client";
import { sleep } from "bun";

interface AuthenticatedSession extends Session {
    user?: string;
    [key: string]: any;
}

export interface AuthenticatedRequest extends Request {
    session: AuthenticatedSession
}
export async function getTCP1P() {
    let tcp1p = client.guilds.cache.find((g) => g.name == "TCP1P Server")
    while (true) {
        if (!tcp1p) {
            console.log("There's no TCP1P?")
            tcp1p = client.guilds.cache.find((g) => g.name == "TCP1P Server")
        } else {
            break
        }
        await sleep(1000)
    }
    return tcp1p
}

export const checkAuth = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (req.session.user) {
        return next();
    }
    req.flash('error', 'Please login to access the admin panel.');
    return res.redirect('/login');
};

export async function updateEvent(id: string, form: EventSchemaType) {
    try {
        await EventModel.findByIdAndUpdate(id, form);
        var event = await EventModel.findById(id)

        if (event == undefined) {
            return
        }

        const now = new Date();

        for (const i in event.timelines) {
            const name = event.timelines[i].name;
            const timezone = event.timelines[i].timezone
            if (!timezone || !event.timelines[i].startTime || !event.timelines[i].endTime) return
            const startTime = formatTimezone(event.timelines[i].startTime, timezones[timezone])
            const endTime = formatTimezone(event.timelines[i].endTime, timezones[timezone])
            const discordEventId = event.timelines[i].discordEventId

            if (!name || !startTime || !endTime) {
                return
            }

            if (new Date(startTime) < now || new Date(endTime) < now) {
                return
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
${event.format}`,
                image: event.logo,
                entityMetadata: {
                    location: `${event.url}`
                }
            }
            const tcp1p = await getTCP1P()
            if (!tcp1p) return
            if (discordEventId) {
                const discordEvent = tcp1p.scheduledEvents.cache.find((scheduledEvent) => scheduledEvent.id == discordEventId)
                if (discordEvent) {
                    await discordEvent.edit(eventOptions)
                } else {
                    const discordEvent = await tcp1p.scheduledEvents.create(eventOptions);
                    event.timelines[i].discordEventId = discordEvent.id
                }
            } else {
                const discordEvent = await tcp1p.scheduledEvents.create(eventOptions);
                event.timelines[i].discordEventId = discordEvent.id
            }
        }
        await event.save()
    } catch (error) {
        console.error(error)
    }
}

export async function deleteEvent(id: string) {
    const event = await EventModel.findById(id).exec();
    const tcp1p = await getTCP1P()
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

export async function reqToForm(req: express.Request): Promise<EventSchemaType | undefined> {
    let event = await EventModel.findById(req.params.id)
    if (!(req.body.timelineName instanceof Array)) {
        return
    }
    const timelines = req.body.timelineName.map((name: any, index: number) => {
        if (typeof index != "number") {
            return
        }
        let resp = {};
        try {
            const startTime = new Date(req.body.timelineStart[index]).toISOString();
            const endTime = new Date(req.body.timelineEnd[index]).toISOString();
            if (!startTime || !endTime) {
                return
            }
            let discordEventId = null
            if (event && event.timelines && event.timelines[index]) {
                discordEventId = event.timelines[index].discordEventId
            }
            resp = {
                name,
                startTime,
                endTime,
                discordEventId,
                timezone: req.body.timezone[index]
            };
        } catch (error) {
            console.log(error)
            return
        }
        return resp;
    }).filter((item: any) => item !== undefined);
    console.log(timelines)
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

export const formatTimezone = (datetime: Date, offset: number) => {
    const sign = offset >= 0 ? '+' : '-';
    const absOffset = Math.abs(offset);
    const formattedOffset = `${sign}${absOffset.toString().padStart(2, '0')}00`;

    return `${datetime.toUTCString()}${formattedOffset}`;
};

export const timezones :any= {
    'WIB': 7,
    'WITA': 8,
    'WIT': 9
};

export async function sanitizeEvents(){

    const events = await EventModel.find().sort({ "timelines.startTime": 1 }).lean().exec();

    const sanitizedEvents = events.map(event => {
        const { _id, ...rest } = event;

        const sanitizedTimelines = rest.timelines.map(timeline => {
            if (!timeline.timezone || !timeline.startTime || !timeline.endTime){
                return
            }
            const { _id, discordEventId, ...timelineRest } = timeline;
            const offset = timezones[timeline.timezone];
            return {
                ...timelineRest,
                startTime: formatTimezone(timeline.startTime, offset),
                endTime: formatTimezone(timeline.endTime, offset)
            };
        }).filter(val => val !== undefined)

        return { ...rest, timelines: sanitizedTimelines };
    });
    return sanitizedEvents
}
