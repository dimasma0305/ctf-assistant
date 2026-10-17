process.env.NODB = 'true';
import { expect, test } from 'bun:test';
import { messageSources } from './attribution';
import { prepareVisionMessages } from './vision';

const message = (id: string, authorId: string, patch: any = {}): any => ({ id, channelId: 'public',
    author: { id: authorId, username: authorId }, attachments: new Map(), embeds: [], ...patch });

test('caller, quoted GIF author and same-speaker media stay distinct and channel scoped', () => {
    const caller = message('look', 'dimas');
    const gif = message('gif', 'kuda', { embeds: [{}] });
    const related = [message('own', 'dimas', { attachments: new Map([['file', {}]]) }), gif,
        message('private', 'dimas', { channelId: 'dm', embeds: [{}] })];
    expect(messageSources(caller, related, gif)).toEqual([
        { messageId: 'gif', authorId: 'kuda', authorName: 'kuda', kind: 'reply' },
        { messageId: 'own', authorId: 'dimas', authorName: 'dimas', kind: 'media' },
    ]);
});

test('source authors remain internal context and never become extra API message properties', () => {
    const sources = [{ messageId: 'gif', authorId: 'kuda', kind: 'reply' as const }];
    const result = prepareVisionMessages([{ role: 'user', content: 'liat ini', messageId: 'look', sources }], 'public');
    expect(result[0].sources).toBeUndefined();
    expect(result[0].content).toContain('"authorId":"kuda"');
});
