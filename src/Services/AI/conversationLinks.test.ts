import { expect, test } from 'bun:test';
import { recentAssistantLinksForSpeaker, relatedSourceLeads, setTurnSourceLinks } from './conversationLinks';
import type { ChatMessage } from './memory';

test('recent assistant links keep source leads with the right speaker', () => {
    const now = Date.parse('2026-10-21T00:30:00Z');
    const history: ChatMessage[] = [
        { role: 'user', name: 'dimas-question', content: 'find Aryma', at: now - 120_000 },
        { role: 'assistant', content: 'see https://example.com/aryma', at: now - 118_000 },
        { role: 'user', name: 'ftp-question', content: 'Securinets?', at: now - 80_000 },
        { role: 'assistant', content: 'global: https://ctftime.org/event/3364/', at: now - 75_000 },
        { role: 'user', name: 'ftp-question', content: 'info acara?', at: now - 40_000 },
        { role: 'assistant', content: '[Info](https://ctf.securinets.tn/) · [Scoreboard](https://quals.securinets.tn/scoreboard)', at: now - 38_000 },
    ];
    expect(recentAssistantLinksForSpeaker(history, 'ftp', now)).toEqual([
        'https://ctf.securinets.tn/', 'https://quals.securinets.tn/scoreboard', 'https://ctftime.org/event/3364/',
    ]);
    expect(recentAssistantLinksForSpeaker(history, 'dimas', now)).toEqual(['https://example.com/aryma']);
});

test('old or credentialed links never become follow-up leads', () => {
    const now = Date.now();
    const history: ChatMessage[] = [
        { role: 'user', name: 'ftp-question', content: 'one', at: now - 20 * 60_000 },
        { role: 'assistant', content: 'https://example.com/old', at: now - 20 * 60_000 },
        { role: 'user', name: 'ftp-question', content: 'two', at: now - 1000 },
        { role: 'assistant', content: 'https://example.com/private?token=secret and https://example.com/public', at: now - 500 },
    ];
    expect(recentAssistantLinksForSpeaker(history, 'ftp', now)).toEqual(['https://example.com/public']);
});

test('fallback leads require an exact previously shared link in this turn', () => {
    const turn = {};
    setTurnSourceLinks(turn, ['https://ctf.securinets.tn/', 'https://quals.securinets.tn/scoreboard', 'https://ctftime.org/event/3364/']);
    expect(relatedSourceLeads(turn, ['https://ctf.securinets.tn/'])).toEqual([
        'https://quals.securinets.tn/scoreboard', 'https://ctftime.org/event/3364/',
    ]);
    expect(relatedSourceLeads(turn, ['https://ctf.securinets.tn/', 'https://quals.securinets.tn/scoreboard']))
        .toEqual(['https://ctftime.org/event/3364/']);
    expect(relatedSourceLeads(turn, ['https://unrelated.example/'])).toEqual([]);
    expect(relatedSourceLeads({}, ['https://ctf.securinets.tn/'])).toEqual([]);
});
