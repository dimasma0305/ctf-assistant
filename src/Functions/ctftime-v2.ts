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

async function infoEvent(id: string): Promise<CTFEvent> {
    const response = await fetch(`https://ctftime.org/api/v1/events/${id}/`);
    const ctfEvent = await response.json() as CTFEvent;

    ctfEvent.start = new Date(ctfEvent.start);
    ctfEvent.finish = new Date(ctfEvent.finish);
    ctfEvent.title = ctfEvent.title.trim()

    return ctfEvent;
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
