process.env.NODB = 'true';
import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { allowedDiscordImageUrl, imageReference, prepareVisionMessages, trimVisionMemory, forgetVisionReferences,
    withoutVisionContent, hasVisionContent, groundVisionDelivery, VISION_CONTEXT_MS, MAX_VISION_IMAGE_BYTES, type ImageReference } from './vision';
import { buildAttachmentBlock } from './attachments';
import { buildExchangeTranscript } from './userProfile';
import type { ChatMessage } from './memory';

const channelId = '111111111111111111';
let serial = 0;
const url = (id = String(++serial)) => `https://cdn.discordapp.com/attachments/${channelId}/222222222222222222/picture-${id}.png?ex=ffffffff&hm=private-signature`;
const attachment = (patch: any = {}) => ({ name: 'screenshot.png', contentType: 'image/png', size: 2048, url: url(), ...patch });
const source = (files: any[] = [], patch: any = {}): any => ({ id: String(++serial), channelId, author: { id: '333333333333333333' },
    attachments: new Map(files.map((file, index) => [String(index), file])), ...patch });
const image = (patch: Partial<ImageReference> = {}): ImageReference => ({ url: url(), name: 'picture.png', messageId: String(++serial),
    authorId: '333333333333333333', channelId, observedAt: Date.now(), ...patch });
const restore: (() => void)[] = [];
afterEach(() => { for (const fn of restore.splice(0)) fn(); });

describe('native Discord vision', () => {
    test('grounds missing pixels without changing assistant speech, stored input, or real native image inputs', () => {
        const messages: any[] = [{ role: 'assistant', content: 'earlier unverified visual guess' }, { role: 'user', content: 'who sent it?' }];
        const grounded = groundVisionDelivery(messages);
        expect(grounded[0].content).toBe(messages[0].content);
        expect(grounded[1].content).toContain('zero images');
        expect(messages[1].content).toBe('who sent it?');
        const native = [{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,fixture' } }] }];
        expect(groundVisionDelivery(native)).toBe(native);
        expect(groundVisionDelivery(withoutVisionContent(native))[0].content).toContain('zero images');
    });
    test('passes real image inputs separately from prompt text without downloading them locally', async () => {
        const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(Object.assign(
            async () => { throw new Error('must not fetch image locally'); }, { preconnect() {} }));
        restore.push(() => fetchSpy.mockRestore());
        const msg = source([attachment()]);
        const block = await buildAttachmentBlock(msg);
        expect(block.images).toHaveLength(1); expect(fetchSpy).not.toHaveBeenCalled();
        expect(block.promptBlock).toContain('pixels supplied separately');
        expect(block.promptBlock).not.toContain('private-signature');
        const prepared = prepareVisionMessages([{ role: 'user', content: 'rik error apa ini?', images: block.images }], channelId);
        expect(prepared[0].content.at(-1)).toEqual({ type: 'image_url', image_url: { url: msg.attachments.get('0').url, detail: 'high' } });
        expect(prepared[0].images).toBeUndefined(); expect(hasVisionContent(prepared)).toBe(true);
    });

    test('uses earlier same-speaker burst images and quoted images, with channel isolation', async () => {
        const current = source();
        const earlier = source([attachment()]);
        const stranger = source([attachment()], { author: { id: 'someone-else' } });
        const privateSource = source([attachment()], { channelId: 'private-dm' });
        const reply = source([attachment()], { author: { id: 'quoted-user' } });
        const block = await buildAttachmentBlock(current, { related: [earlier, stranger, privateSource], reply });
        expect(block.images.map(item => item.messageId)).toEqual([earlier.id, reply.id]);
    });

    test('rejects arbitrary hosts, localhost, credentials, ports and expired signed URLs', () => {
        for (const value of ['http://cdn.discordapp.com/attachments/1/2/x.png', 'https://localhost/image.png',
            'https://cdn.discordapp.com.evil.test/attachments/1/2/a.png', 'https://a:b@cdn.discordapp.com/attachments/1/2/a.png',
            'https://cdn.discordapp.com:8443/attachments/1/2/a.png', 'https://cdn.discordapp.com/attachments/1/2/a.png?ex=1',
            'data:image/png;base64,AAAA', 'https://cdn.discordapp.com/not-attachments/x.png']) expect(allowedDiscordImageUrl(value)).toBe(false);
        expect(allowedDiscordImageUrl(url())).toBe(true);
    });

    test('bounds image size and supports only provider formats', () => {
        const msg = source();
        for (const bad of [attachment({ size: MAX_VISION_IMAGE_BYTES + 1 }), attachment({ size: 0 }),
            attachment({ name: 'image.svg', contentType: 'image/svg+xml' }), attachment({ contentType: 'image/avif' })]) {
            expect(imageReference(bad, msg).image).toBeUndefined();
        }
        for (const contentType of ['image/png', 'image/jpeg', 'image/gif', 'image/webp']) expect(imageReference(attachment({ contentType }), msg).image).toBeDefined();
    });

    test('retains at most four recent image references and never crosses channels', () => {
        const messages: ChatMessage[] = Array.from({ length: 7 }, () => ({ role: 'user', content: 'picture', images: [image()] }));
        messages.push({ role: 'user', content: 'old', images: [image({ observedAt: Date.now() - VISION_CONTEXT_MS - 1 }), image({ channelId: 'private-dm' })] });
        trimVisionMemory(messages, channelId);
        expect(messages.flatMap(message => message.images || [])).toHaveLength(4);
        expect(messages[0].images).toBeUndefined();
        expect(messages.at(-1)!.images).toBeUndefined();
    });

    test('a text follow-up can still see the previous image; assistant messages cannot carry pixels', () => {
        const previous = image();
        const prepared = prepareVisionMessages([{ role: 'user', content: 'lihat ini', images: [previous] },
            { role: 'assistant', content: 'ada dua kotak', images: [image()] }, { role: 'user', content: 'yang kiri warnanya apa?' }], channelId);
        expect(hasVisionContent(prepared)).toBe(true);
        expect(typeof prepared[1].content).toBe('string');
        expect(prepared[2].content).toBe('yang kiri warnanya apa?');
    });

    test('DM and other-channel images cannot appear in a public provider payload', () => {
        const prepared = prepareVisionMessages([{ role: 'user', content: 'something', images: [image({ channelId: 'private-dm' })] }], channelId);
        expect(hasVisionContent(prepared)).toBe(false); expect(prepared[0].images).toBeUndefined();
    });

    test('a quoted image is not sent twice across history, even with a refreshed signature', () => {
        const first = image();
        const refreshed = { ...first, url: first.url.replace('private-signature', 'fresh-signature') };
        const prepared = prepareVisionMessages([{ role: 'user', content: 'old', images: [first] },
            { role: 'user', content: 'now', images: [refreshed] }], channelId);
        expect(prepared.flatMap(message => Array.isArray(message.content) ? message.content.filter((part: any) => part.type === 'image_url') : [])).toHaveLength(1);
        expect(prepared[1].content.at(-1).image_url.url).toContain('fresh-signature');
    });

    test('deletions/edits forget only the matching image source', () => {
        const first = image(), second = image();
        const messages: ChatMessage[] = [{ role: 'user', content: 'two pictures', images: [first, second] }];
        forgetVisionReferences(messages, first.messageId);
        expect(messages[0].images).toEqual([second]);
        forgetVisionReferences(messages); expect(messages[0].images).toBeUndefined();
    });

    test('expired visual context explicitly prevents inventing unseen details', () => {
        const messages: ChatMessage[] = [{ role: 'user', content: 'lihat foto ini', hadImages: true,
            images: [image({ observedAt: Date.now() - VISION_CONTEXT_MS - 1 })] }];
        trimVisionMemory(messages, channelId);
        const prepared = prepareVisionMessages(messages, channelId);
        expect(hasVisionContent(prepared)).toBe(false);
        expect(prepared[0].content).toContain('Original image pixels are unavailable');
        expect(prepared[0].hadImages).toBeUndefined();
    });

    test('failure removes pixel inputs and explicitly prevents invented descriptions', () => {
        const prepared = prepareVisionMessages([{ role: 'user', content: 'what is this?', images: [image()] }], channelId);
        const fallback = withoutVisionContent(prepared);
        expect(hasVisionContent(fallback)).toBe(false); expect(fallback[0].content).toContain('No pixels are available');
        expect(fallback[0].content).not.toContain('private-signature');
    });

    test('visual references never enter profile transcripts', () => {
        const transcript = buildExchangeTranscript('user-id', 'Rafi', [{ role: 'user', name: 'user-id-name', content: 'lihat screenshot', images: [image()] }]);
        expect(transcript).toContain('lihat screenshot'); expect(transcript).not.toContain('discordapp');
    });

    test('distinguishes an old upload from its current access and the current reply without extra API fields', async () => {
        const uploaded = Date.parse('2026-10-15T14:00:00Z');
        const quoted = source([attachment()], { createdTimestamp: uploaded });
        const current = source();
        const block = await buildAttachmentBlock(current, { reply: quoted });
        const prepared = prepareVisionMessages([{ role: 'user', content: 'yang sama tadi', messageId: current.id,
            at: Date.parse('2026-10-15T14:30:00Z'), replyToMessageId: quoted.id, images: block.images }], channelId);
        const text = prepared[0].content.filter((part: any) => part.type === 'text').map((part: any) => part.text).join('\n');
        expect(text).toContain('2026-10-15T14:00:00.000Z'); expect(text).toContain('2026-10-15T14:30:00.000Z');
        expect(text).toContain('earlier access'); expect(text).toContain('replyToMessageId');
        expect(prepared[0]).not.toHaveProperty('at'); expect(prepared[0]).not.toHaveProperty('messageId');
        expect(prepared[0]).not.toHaveProperty('replyToMessageId');
    });

    test('assistant history stays speech-only; chronology is kept once in current user context', () => {
        const old = '[Discord chronology: {"sentAt":"2026-10-15T14:00:00Z"}]';
        const prepared = prepareVisionMessages([{ role: 'assistant', content: `Miku wkwk\n${old}`, at: Date.now(), replyToMessageId: 'original-question' },
            { role: 'user', content: 'lanjut dong', messageId: 'current-question', at: Date.now() }], channelId);
        expect(prepared[0].content).toBe('Miku wkwk');
        expect(prepared[1].content).toContain('[Discord chronology:');
        expect(prepared[1].content).toContain('original-question');
        expect(prepared[1].content).toContain('current-question');
        expect(JSON.stringify(prepared)).not.toContain('2026-10-15T14:00:00Z');
    });

    test('vision can be disabled without disabling text attachment handling', async () => {
        const original = process.env.AI_VISION; process.env.AI_VISION = 'false';
        restore.push(() => { if (original === undefined) delete process.env.AI_VISION; else process.env.AI_VISION = original; });
        const block = await buildAttachmentBlock(source([attachment()]));
        expect(block.images).toEqual([]); expect(block.promptBlock).toContain('vision disabled');
        expect(hasVisionContent(prepareVisionMessages([{ role: 'user', content: 'photo', images: [image()] }], channelId))).toBe(false);
    });
});
