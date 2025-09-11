import { CTFCacheModel } from '../Database/connect';

interface Duration {
    hours: number;
    days: number;
}

interface Organizer {
    id: number;
    name: string;
}

export interface CTFEvent {
    organizers: Organizer[];
    onsite: boolean;
    finish: Date;
    description: string;
    weight: number;
    title: string;
    url: string;
    is_votable_now: boolean;
    restrictions: string;
    format: string;
    start: Date;
    participants: number;
    ctftime_url: string;
    location: string;
    live_feed: string;
    public_votable: boolean;
    duration: Duration;
    logo: string;
    format_id: number;
    id: number;
    ctf_id: number;
}

async function infoEvent(id: string, useCache: boolean = true): Promise<CTFEvent> {
    try {
        // Check if we have cached data (and respect useCache parameter)
        let cachedEvent = null;
        if (useCache) {
            cachedEvent = await CTFCacheModel.findOne({ 
                ctf_id: id,
            });
        }

        if (cachedEvent && useCache) {
            // Return cached data in CTFEvent format
            return {
                organizers: (cachedEvent.organizers || []).map((org: any) => ({
                    id: org.id || 0,
                    name: org.name || ''
                })) as Organizer[],
                onsite: cachedEvent.onsite || false,
                finish: cachedEvent.finish,
                description: cachedEvent.description || '',
                weight: cachedEvent.weight,
                title: cachedEvent.title,
                url: cachedEvent.url || '',
                is_votable_now: false,
                restrictions: cachedEvent.restrictions || '',
                format: cachedEvent.format || '',
                start: cachedEvent.start,
                participants: cachedEvent.participants || 0,
                ctftime_url: `https://ctftime.org/event/${id}`,
                location: cachedEvent.location || '',
                live_feed: '',
                public_votable: false,
                duration: {
                    hours: cachedEvent.duration?.hours || 0,
                    days: cachedEvent.duration?.days || 0
                } as Duration,
                logo: cachedEvent.logo || '',
                format_id: 0,
                id: parseInt(id),
                ctf_id: parseInt(id)
            };
        }

        // Fetch from API if not cached or cache is old
        const response = await fetch(`https://ctftime.org/api/v1/events/${id}/`);
        const ctfEvent = await response.json() as CTFEvent;

        ctfEvent.start = new Date(ctfEvent.start);
        ctfEvent.finish = new Date(ctfEvent.finish);
        ctfEvent.title = ctfEvent.title.trim();

        // Cache the event data
        await CTFCacheModel.findOneAndUpdate(
            { ctf_id: id },
            {
                ctf_id: id,
                title: ctfEvent.title,
                weight: ctfEvent.weight,
                start: ctfEvent.start,
                finish: ctfEvent.finish,
                participants: ctfEvent.participants,
                organizers: ctfEvent.organizers,
                description: ctfEvent.description,
                url: ctfEvent.url,
                logo: ctfEvent.logo,
                format: ctfEvent.format,
                location: ctfEvent.location,
                onsite: ctfEvent.onsite,
                restrictions: ctfEvent.restrictions,
                duration: ctfEvent.duration,
                cached_at: new Date(),
                last_updated: new Date()
            },
            { upsert: true, new: true }
        );

        return ctfEvent;
    } catch (error) {
        console.error(`Error fetching/caching CTF event ${id}:`, error);
        throw error;
    }
}

async function getUpcommingOnlineEvent(days: number): Promise<CTFEvent[]> {
    const start = parseInt((Date.now() / 1000).toFixed())
    const finish = start + (days * 24 * 60 * 100)
    const response = await fetch(`https://ctftime.org/api/v1/events/?limit=10&start=${start}&finish=${finish}`)
    var ctfEvents = await response.json() as CTFEvent[]
    ctfEvents.forEach((ctfEvent) => {
        ctfEvent.start = new Date(ctfEvent.start);
        ctfEvent.finish = new Date(ctfEvent.finish);
        ctfEvent.title = ctfEvent.title.trim();
    })
    ctfEvents = ctfEvents.filter((ctfEvent)=>{
        return ctfEvent.location == "" && ctfEvent.onsite == false
    })
    return ctfEvents
}

export { infoEvent, getUpcommingOnlineEvent };
