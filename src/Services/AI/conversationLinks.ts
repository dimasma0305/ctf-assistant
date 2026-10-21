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
