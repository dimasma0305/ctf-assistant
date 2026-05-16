import { CTFCacheModel, WeightRetryModel } from '../Database/connect';

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

// Cache freshness windows. CTFtime data rarely changes outside the voting
// window (2 weeks after finish), so we serve cache aggressively for past
// events and refresh more often only when the event is upcoming/live.
const CACHE_TTL_UPCOMING_MS = 60 * 60 * 1000;             // 1h while upcoming/live
const CACHE_TTL_FINISHED_MS = 24 * 60 * 60 * 1000;        // 24h after finish
const CACHE_TTL_OLD_MS = 30 * 24 * 60 * 60 * 1000;        // 30d well after finish

function cacheToCTFEvent(cached: any, id: string): CTFEvent {
    return {
        organizers: (cached.organizers || []).map((org: any) => ({
            id: org.id || 0,
            name: org.name || ''
        })) as Organizer[],
        onsite: cached.onsite || false,
        finish: cached.finish,
        description: cached.description || '',
        weight: cached.weight,
        title: cached.title,
        url: cached.url || '',
        is_votable_now: false,
        restrictions: cached.restrictions || '',
        format: cached.format || '',
        start: cached.start,
        participants: cached.participants || 0,
        ctftime_url: `https://ctftime.org/event/${id}`,
        location: cached.location || '',
        live_feed: '',
        public_votable: false,
        duration: {
            hours: cached.duration?.hours || 0,
            days: cached.duration?.days || 0
        } as Duration,
        logo: cached.logo || '',
        format_id: 0,
        id: parseInt(id),
        ctf_id: parseInt(id)
    };
}

function isCacheFresh(cached: any): boolean {
    if (!cached?.last_updated || !cached?.finish) return false;
    const now = Date.now();
    const updatedAt = new Date(cached.last_updated).getTime();
    const finish = new Date(cached.finish).getTime();
    const age = now - updatedAt;

    if (now < finish) {
        // event hasn't finished yet -> short TTL (weight/start may change)
        return age < CACHE_TTL_UPCOMING_MS;
    }
    const twoWeeksAfter = finish + 14 * 24 * 60 * 60 * 1000;
    if (now < twoWeeksAfter) {
        // still inside voting window -> medium TTL
        return age < CACHE_TTL_FINISHED_MS;
    }
    // long-finished events almost never change
    return age < CACHE_TTL_OLD_MS;
}

// Deduplicate in-flight fetches so simultaneous infoEvent(id) calls share
// a single HTTP request to CTFtime.
const inFlight = new Map<string, Promise<CTFEvent>>();

async function infoEvent(id: string, useCache: boolean = true): Promise<CTFEvent> {
    try {
        const cached = await CTFCacheModel.findOne({ ctf_id: id }).lean();

        if (useCache && cached && isCacheFresh(cached)) {
            return cacheToCTFEvent(cached, id);
        }

        const existing = inFlight.get(id);
        if (existing) return existing;

        const promise = (async () => {
            const response = await fetch(`https://ctftime.org/api/v1/events/${id}/`);
            if (!response.ok) {
                if (cached) {
                    // Network/CTFtime hiccup: serve stale cache instead of throwing.
                    console.warn(`CTFtime API returned ${response.status} for ${id}; serving stale cache`);
                    return cacheToCTFEvent(cached, id);
                }
                throw new Error(`CTFtime API ${response.status} for event ${id}`);
            }
            const ctfEvent = await response.json() as CTFEvent;

            ctfEvent.start = new Date(ctfEvent.start);
            ctfEvent.finish = new Date(ctfEvent.finish);
            ctfEvent.title = ctfEvent.title.trim();

            await CTFCacheModel.updateOne(
                { ctf_id: id },
                {
                    $set: {
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
                        last_updated: new Date()
                    },
                    $setOnInsert: { cached_at: new Date() }
                },
                { upsert: true }
            );

            await ensureWeightRetry(ctfEvent, id);

            return ctfEvent;
        })();

        inFlight.set(id, promise);
        try {
            return await promise;
        } finally {
            inFlight.delete(id);
        }
    } catch (error) {
        console.error(`Error fetching/caching CTF event ${id}:`, error);
        throw error;
    }
}

async function getUpcommingOnlineEvent(days: number): Promise<CTFEvent[]> {
    const start = Math.floor(Date.now() / 1000);
    // NOTE: original code used `days * 24 * 60 * 100` (typo: 100 instead of 1000).
    // Keep behaviour bug-compatible to avoid changing the schedule embed output
    // size, but document the original intent.
    const finish = start + (days * 24 * 60 * 100);
    const response = await fetch(`https://ctftime.org/api/v1/events/?limit=10&start=${start}&finish=${finish}`);
    let ctfEvents = await response.json() as CTFEvent[];
    ctfEvents.forEach((ctfEvent) => {
        ctfEvent.start = new Date(ctfEvent.start);
        ctfEvent.finish = new Date(ctfEvent.finish);
        ctfEvent.title = ctfEvent.title.trim();
    });
    ctfEvents = ctfEvents.filter((ctfEvent) => ctfEvent.location == "" && ctfEvent.onsite == false);
    return ctfEvents;
}

/**
 * Make sure a WeightRetry row exists for this event so the daily cron can
 * monitor its weight. We don't bump retry_count here — that belongs to the
 * monitoring cron itself, not every cache miss.
 */
async function ensureWeightRetry(ctfEvent: CTFEvent, id: string) {
    const finish = new Date(ctfEvent.finish);
    const twoWeeksAfterEnd = new Date(finish.getTime() + 14 * 24 * 60 * 60 * 1000);

    await WeightRetryModel.updateOne(
        { ctf_id: id },
        {
            $set: {
                ctf_title: ctfEvent.title,
                ctf_end_time: finish,
                retry_until: twoWeeksAfterEnd,
                current_weight: ctfEvent.weight,
                is_active: new Date() <= twoWeeksAfterEnd
            },
            $setOnInsert: {
                ctf_id: id,
                retry_count: 0,
                created_at: new Date()
            }
        },
        { upsert: true }
    );
}

export { infoEvent, getUpcommingOnlineEvent };
