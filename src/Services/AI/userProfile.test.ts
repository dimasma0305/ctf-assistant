process.env.NODB = 'true';

import { expect, test } from 'bun:test';
import { buildExchangeTranscript, buildStoredRelationshipTranscript, hasOwnedRelationshipEvidence, type UserProfile } from './userProfile';
import type { ChatMessage } from './memory';

test('relationship reset excludes old and undated exchanges without attributing other users to this profile', () => {
    const messages: ChatMessage[] = [
        { role: 'user', name: 'caller-name', content: 'old argument', at: 999 },
        { role: 'assistant', content: 'late answer to old argument', at: 1001 },
        { role: 'user', name: 'caller-name', content: 'undated cached argument' },
        { role: 'assistant', content: 'undated cached response' },
        { role: 'user', name: 'other-name', content: 'someone else', at: 1002 },
        { role: 'assistant', content: 'answer to someone else', at: 1003 },
        { role: 'user', name: 'caller-name', content: 'new conversation', at: 1000 },
        { role: 'assistant', content: 'new answer', at: 1004 },
    ];
    const transcript = JSON.parse(buildExchangeTranscript('caller', 'Caller', messages, new Date(1000)));
    expect(transcript.targetUserId).toBe('caller');
    expect(transcript.turns.map((turn: any) => turn.text)).toEqual(['new conversation', 'new answer']);
    expect(transcript.turns[1].contextOnly).toBe(true);
});

test('profiles without a reset still include their undated exchanges', () => {
    const transcript = JSON.parse(buildExchangeTranscript('caller', 'Caller', [
        { role: 'user', name: 'caller-name', content: 'hello' },
        { role: 'assistant', content: 'hi' },
    ]));
    expect(transcript.turns.map((turn: any) => turn.text)).toEqual(['hello', 'hi']);
});

test('forwarded media keeps the source owner separate from the profile owner', () => {
    const transcript = buildExchangeTranscript('dimas', 'Dimas', [
        { role: 'user', name: 'dimas-name', messageId: 'look', content: 'liat ini',
            sources: [{ kind: 'reply', messageId: 'gif', authorId: 'kuda', authorName: 'KudaLiar' }] },
        { role: 'assistant', messageId: 'rebuke', content: 'jangan diulang' },
    ]);
    expect(JSON.parse(transcript).turns[0].sources[0].authorId).toBe('kuda');
    expect(hasOwnedRelationshipEvidence('dimas', transcript, ['look'])).toBe(true);
    for (const ids of [[], ['gif'], ['rebuke'], ['look', 'gif'], ['invented'], 'look']) {
        expect(hasOwnedRelationshipEvidence('dimas', transcript, ids)).toBe(false);
    }
    expect(hasOwnedRelationshipEvidence('kuda', transcript, ['look'])).toBe(false);
});

test('already evaluated messages stay available as context but cannot support another relationship change', () => {
    const transcript = buildExchangeTranscript('caller', 'Caller', [
        { role: 'user', name: 'caller-name', messageId: 'old', content: 'previous incident' },
        { role: 'assistant', content: 'previous response' },
        { role: 'user', name: 'caller-name', messageId: 'fresh', content: 'new conversation' },
    ], undefined, ['old']);
    expect(JSON.parse(transcript).turns[0].contextOnly).toBe(true);
    expect(hasOwnedRelationshipEvidence('caller', transcript, ['old'])).toBe(false);
    expect(hasOwnedRelationshipEvidence('caller', transcript, ['old', 'fresh'])).toBe(false);
    expect(hasOwnedRelationshipEvidence('caller', transcript, ['fresh'])).toBe(true);
});

test('answered exchanges from separate channels remain available for one person without replaying old evidence', () => {
    const profile = { userId: 'caller', displayName: 'Caller', affectionResetAt: new Date(1000),
        evaluatedRelationshipMessageIds: ['old'], recentRelationshipExchanges: [
            { messageId: 'before-reset', at: new Date(999), userText: 'old conflict', assistantText: 'old reply' },
            { messageId: 'old', at: new Date(1001), userText: 'first channel', assistantText: 'first answer' },
            { messageId: 'fresh', at: new Date(1002), userText: 'liat ini', assistantText: 'second answer',
                sources: [{ kind: 'reply', messageId: 'someone-else', authorId: 'other' }] },
        ] } as UserProfile;
    const transcript = buildStoredRelationshipTranscript(profile);
    const turns = JSON.parse(transcript).turns;
    expect(turns.map((turn: { text: string }) => turn.text)).toEqual([
        'first channel', 'first answer', 'liat ini', 'second answer',
    ]);
    expect(turns[0].contextOnly).toBe(true);
    expect(turns[2].sources).toEqual([{ kind: 'reply', messageId: 'someone-else', authorId: 'other' }]);
    expect(hasOwnedRelationshipEvidence('caller', transcript, ['old'])).toBe(false);
    expect(hasOwnedRelationshipEvidence('caller', transcript, ['fresh'])).toBe(true);
    expect(hasOwnedRelationshipEvidence('caller', transcript, ['someone-else'])).toBe(false);
});

test('cross-channel evaluation retains all five answered turns when the last channel has only one', () => {
    const exchanges = Array.from({ length: 5 }, (_, index) => ({ messageId: `turn-${index + 1}`,
        at: new Date(2000 + index), userText: `pesan ${index + 1}`, assistantText: `jawaban ${index + 1}` }));
    const profile = { userId: 'caller', displayName: 'Caller', recentRelationshipExchanges: exchanges } as UserProfile;
    const oldLastChannel = buildExchangeTranscript('caller', 'Caller', [
        { role: 'user', name: 'caller-name', messageId: 'turn-5', content: 'pesan 5' },
        { role: 'assistant', content: 'jawaban 5' },
    ]);
    const current = buildStoredRelationshipTranscript(profile);
    expect(JSON.parse(oldLastChannel).turns.filter((turn: { role: string }) => turn.role === 'user')).toHaveLength(1);
    expect(JSON.parse(current).turns.filter((turn: { role: string }) => turn.role === 'user')).toHaveLength(5);
    expect(hasOwnedRelationshipEvidence('caller', current, ['turn-1', 'turn-5'])).toBe(true);
});
