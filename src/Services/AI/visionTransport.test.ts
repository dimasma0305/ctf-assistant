process.env.NODB = 'true';
import { afterEach, expect, spyOn, test } from 'bun:test';
import { inlineDiscordImages, type VisionDownloadCache } from './visionTransport';
import { MAX_VISION_IMAGE_BYTES } from './vision';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=', 'base64');
const url = (id = 1) => `https://cdn.discordapp.com/attachments/111111111111111111/222222222222222222/image-${id}.png?ex=ffffffff&hm=private`;
const input = (urls = [url()]) => [{ role: 'user', content: [{ type: 'text', text: 'lihat ini' },
    ...urls.map(value => ({ type: 'image_url', image_url: { url: value, detail: 'high' } }))] }];
const restore: (() => void)[] = [];
afterEach(() => { for (const fn of restore.splice(0)) fn(); });
function mockFetch(fn: (...args: any[]) => Promise<Response>) {
    const spy = spyOn(globalThis, 'fetch').mockImplementation(Object.assign(fn, { preconnect() {} }));
    restore.push(() => spy.mockRestore());
    return spy;
}

test('downloads the actual CDN bytes and fixes MIME mismatches without changing stored references', async () => {
    const spy = mockFetch(async () => new Response(png, { headers: { 'content-type': 'image/webp' } }));
    const messages = input();
    const original = JSON.stringify(messages);
    const result = await inlineDiscordImages(messages);
    const image = result.messages[0].content[1].image_url;
    expect(result.deliveredImages).toBe(1); expect(result.failures).toEqual([]);
    expect(image.url).toBe(`data:image/png;base64,${png.toString('base64')}`);
    expect(Buffer.from(image.url.split(',')[1], 'base64')).toEqual(png);
    expect(image.detail).toBe('high'); expect(JSON.stringify(messages)).toBe(original);
    expect(spy.mock.calls[0][0]).toBe(url());
    expect(spy.mock.calls[0][1]).toMatchObject({ redirect: 'error' });
    expect(spy.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
});

test('reuses bytes only through an explicit turn cache, including across tool iterations', async () => {
    const spy = mockFetch(async () => new Response(png));
    const cache: VisionDownloadCache = new Map();
    await inlineDiscordImages(input(), { cache }); await inlineDiscordImages(input(), { cache });
    expect(spy).toHaveBeenCalledTimes(1);
    await inlineDiscordImages(input()); expect(spy).toHaveBeenCalledTimes(2);
});

test('rejects arbitrary hosts, expired URLs, external data URLs, and non-user images before fetching', async () => {
    const spy = mockFetch(async () => { throw new Error('must not fetch'); });
    const bad = ['https://localhost/attachments/1/2/x.png', 'https://cdn.discordapp.com.evil.test/attachments/1/2/x.png',
        url().replace('ex=ffffffff', 'ex=1'), `data:image/png;base64,${png.toString('base64')}`];
    for (const value of bad) {
        const result = await inlineDiscordImages(input([value]));
        expect(result.deliveredImages).toBe(0); expect(result.failures).toEqual(['invalid_url']);
    }
    expect((await inlineDiscordImages([{ ...input()[0], role: 'assistant' }])).deliveredImages).toBe(0);
    expect(spy).not.toHaveBeenCalled();
});

test('keeps valid images when another CDN attachment is unavailable and caches failures for the turn', async () => {
    const spy = mockFetch(async value => value === url(1) ? new Response(png) : new Response('forbidden', { status: 403 }));
    const cache: VisionDownloadCache = new Map();
    const messages = input([url(1), url(2)]);
    const result = await inlineDiscordImages(messages, { cache });
    expect(result.deliveredImages).toBe(1); expect(result.failures).toEqual(['http_error']);
    expect(JSON.stringify(result.messages)).toContain('No pixels are available for this image');
    expect(JSON.stringify(result.messages)).not.toContain('hm=private');
    await inlineDiscordImages(messages, { cache }); expect(spy).toHaveBeenCalledTimes(2);
});

test('rejects redirects and non-image responses without leaking URLs or server error bodies', async () => {
    const spy = mockFetch(async () => { throw new TypeError('redirect to http://localhost/private'); });
    const result = await inlineDiscordImages(input());
    expect(result.failures).toEqual(['download_failed']); expect(JSON.stringify(result)).not.toContain('localhost');
    spy.mockImplementation(Object.assign(async () => new Response('<html>not pixels</html>', { headers: { 'content-type': 'image/png' } }), { preconnect() {} }));
    expect((await inlineDiscordImages(input())).failures).toEqual(['unsupported_image']);
});

test('bounds both advertised and streamed bytes and cancels oversized responses', async () => {
    let cancelled = false;
    const spy = mockFetch(async () => new Response(new ReadableStream({ cancel() { cancelled = true; } }),
        { headers: { 'content-length': String(MAX_VISION_IMAGE_BYTES + 1) } }));
    expect((await inlineDiscordImages(input())).failures).toEqual(['too_large']); expect(cancelled).toBe(true);
    cancelled = false;
    spy.mockImplementation(Object.assign(async () => new Response(new ReadableStream({
        start(controller) { controller.enqueue(new Uint8Array(MAX_VISION_IMAGE_BYTES)); controller.enqueue(new Uint8Array(1)); },
        cancel() { cancelled = true; },
    })), { preconnect() {} }));
    expect((await inlineDiscordImages(input())).failures).toEqual(['too_large']); expect(cancelled).toBe(true);
});

test('obeys the outer turn cancellation instead of starting a text-only retry', async () => {
    const controller = new AbortController(); controller.abort(new Error('turn superseded'));
    mockFetch(async (_url, options) => { options.signal.throwIfAborted(); return new Response(png); });
    await expect(inlineDiscordImages(input(), { signal: controller.signal })).rejects.toThrow('turn superseded');
});

test('bounds downloads at four newest images and leaves ordinary text untouched', async () => {
    const spy = mockFetch(async () => new Response(png));
    const result = await inlineDiscordImages(input([1, 2, 3, 4, 5].map(url)));
    expect(result.deliveredImages).toBe(4); expect(result.failures).toEqual(['image_budget']);
    expect(spy).toHaveBeenCalledTimes(4);
    expect(spy.mock.calls.map(call => call[0])).toEqual([2, 3, 4, 5].map(url));
    const text = [{ role: 'user', content: 'halo' }]; expect((await inlineDiscordImages(text)).messages).toEqual(text);
});
