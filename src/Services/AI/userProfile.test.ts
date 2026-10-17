process.env.NODB = 'true';

import { expect, test } from 'bun:test';
import { buildExchangeTranscript, hasOwnedRelationshipEvidence } from './userProfile';
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
