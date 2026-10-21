import type { ChatMessage } from './memory';
import { publicResearchUrl } from './researchSources';

/** Same-channel source leads from answers to this speaker, not verified reads. */
export function recentAssistantLinksForSpeaker(history: ChatMessage[], speakerId: string, now: number): string[] {
    const urls: string[] = [];
    for (let i = history.length - 1; i > 0 && urls.length < 6; i--) {
        const answer = history[i], request = history[i - 1];
        if (answer.role !== 'assistant' || request.role !== 'user'
            || !request.name?.startsWith(`${speakerId}-`)
            || !answer.at || now - answer.at > 15 * 60_000 || answer.at > now + 5_000) continue;
        for (const match of answer.content.matchAll(/https?:\/\/[^\s<>()]+/g)) {
            const url = publicResearchUrl(match[0].replace(/[.,;!?]+$/, ''));
            if (url && !urls.includes(url)) urls.push(url);
            if (urls.length >= 6) break;
        }
    }
    return urls;
}

const turnLinks = new WeakMap<object, string[]>();
export function setTurnSourceLinks(turn: object, links: string[]): void { turnLinks.set(turn, links); }

/** Only extend a cited follow-up with other links from the same speaker's prior answers. */
export function relatedSourceLeads(turn: object, requested: string[]): string[] {
    const links = turnLinks.get(turn) || [];
    const exact = requested.map(url => publicResearchUrl(url)).filter(Boolean) as string[];
    if (!exact.some(url => links.includes(url))) return [];
    return links.filter(url => !exact.includes(url)).slice(0, 3);
}
