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
            // Check if weight is 0 and handle fallback
            let finalWeight = cachedEvent.weight;
            
            if (cachedEvent.weight === 0) {
                // Check if we should use fallback weight (past retry period)
                const retryEntry = await WeightRetryModel.findOne({ ctf_id: id });
                if (retryEntry && new Date() > retryEntry.retry_until) {
                    finalWeight = 10; // Use fallback weight
                }
            }
            
            // Return cached data in CTFEvent format
            return {
                organizers: (cachedEvent.organizers || []).map((org: any) => ({
                    id: org.id || 0,
                    name: org.name || ''
                })) as Organizer[],
                onsite: cachedEvent.onsite || false,
                finish: cachedEvent.finish,
                description: cachedEvent.description || '',
                weight: finalWeight,
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

        // Handle weight = 0 (not assigned yet)
        await handleWeightRetry(ctfEvent, id);

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

/**
 * Handle weight retry logic for CTFs with weight = 0
 */
async function handleWeightRetry(ctfEvent: CTFEvent, id: string) {
    if (ctfEvent.weight === 0) {
        const oneWeekAfterEnd = new Date(ctfEvent.finish);
        oneWeekAfterEnd.setDate(oneWeekAfterEnd.getDate() + 7);
        
        // Create or update weight retry entry
        await WeightRetryModel.findOneAndUpdate(
            { ctf_id: id },
            {
                ctf_id: id,
                ctf_title: ctfEvent.title,
                ctf_end_time: ctfEvent.finish,
                retry_until: oneWeekAfterEnd,
                last_retry: new Date(),
                $inc: { retry_count: 1 },
                is_active: new Date() <= oneWeekAfterEnd
            },
            { upsert: true, new: true }
        );
        
        console.log(`📊 CTF ${ctfEvent.title} (${id}) has weight 0 - scheduled for daily retry until ${oneWeekAfterEnd.toDateString()}`);
    } else {
        // Weight is assigned, deactivate retry if exists
        await WeightRetryModel.updateOne(
            { ctf_id: id },
            { $set: { is_active: false } }
        );
    }
}

export { infoEvent, getUpcommingOnlineEvent };
