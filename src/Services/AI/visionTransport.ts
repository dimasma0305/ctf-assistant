import { allowedDiscordImageUrl, MAX_VISION_IMAGES, MAX_VISION_IMAGE_BYTES } from './vision';

const DOWNLOAD_TIMEOUT_MS = 10_000;
type Failure = 'invalid_url' | 'image_budget' | 'http_error' | 'too_large' | 'unsupported_image' | 'timeout' | 'download_failed';
type Download = { dataUrl: string; reason?: never } | { dataUrl?: never; reason: Failure };
/** Owned by one chat turn. Image bytes never enter conversation memory or disk. */
export type VisionDownloadCache = Map<string, Promise<Download>>;

function imageMime(bytes: Uint8Array): string | undefined {
    const header = Buffer.from(bytes.subarray(0, 12));
    if (header.length >= 8 && header.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
    if (header.length >= 3 && header[0] === 255 && header[1] === 216 && header[2] === 255) return 'image/jpeg';
    if (/^GIF8[79]a/.test(header.toString('ascii'))) return 'image/gif';
    if (header.length >= 12 && header.toString('ascii', 0, 4) === 'RIFF' && header.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
}

async function download(url: string, signal?: AbortSignal): Promise<Download> {
    if (!allowedDiscordImageUrl(url)) return { reason: 'invalid_url' };
    const timeout = AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS);
    const downloadSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
    try {
        const response = await fetch(url, { redirect: 'error', signal: downloadSignal });
        if (!response.ok) { await response.body?.cancel(); return { reason: 'http_error' }; }
        const length = Number(response.headers.get('content-length'));
        if (length > MAX_VISION_IMAGE_BYTES) { await response.body?.cancel(); return { reason: 'too_large' }; }
        const reader = response.body?.getReader();
        if (!reader) return { reason: 'download_failed' };
        const chunks: Uint8Array[] = [];
        let total = 0;
        try {
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                total += value.byteLength;
                if (total > MAX_VISION_IMAGE_BYTES) { await reader.cancel(); return { reason: 'too_large' }; }
                chunks.push(value);
            }
        } finally { reader.releaseLock(); }
        const bytes = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
        const mime = imageMime(bytes);
        if (!mime) return { reason: 'unsupported_image' };
        return { dataUrl: `data:${mime};base64,${Buffer.from(bytes).toString('base64')}` };
    } catch {
        // The outer chat deadline must still abort the turn, rather than start
        // an answer without images after the overall request was cancelled.
        if (signal?.aborted) throw signal.reason;
        return { reason: timeout.aborted ? 'timeout' : 'download_failed' };
    }
}

/** Resolve approved CDN URLs locally; the provider cannot reliably fetch them. */
export async function inlineDiscordImages(messages: any[], options: { cache?: VisionDownloadCache; signal?: AbortSignal } = {}) {
    const cache = options.cache || new Map<string, Promise<Download>>();
    let deliveredImages = 0, considered = 0;
    const failures: Failure[] = [];
    const result = [];
    for (const message of messages) {
        if (!Array.isArray(message.content)) { result.push(message); continue; }
        const content = [];
        for (const part of message.content) {
            if (part.type !== 'image_url') { content.push(part); continue; }
            const url = part.image_url?.url;
            let image: Download;
            if (message.role !== 'user' || !allowedDiscordImageUrl(url)) image = { reason: 'invalid_url' };
            else if (++considered > MAX_VISION_IMAGES) image = { reason: 'image_budget' };
            else {
                if (!cache.has(url)) cache.set(url, download(url, options.signal));
                image = await cache.get(url)!;
            }
            if (image.dataUrl) {
                deliveredImages++;
                content.push({ ...part, image_url: { ...part.image_url, url: image.dataUrl } });
            } else {
                failures.push(image.reason!);
                content.push({ type: 'text', text: `[This image could not be loaded (${image.reason}). No pixels are available for this image. Do not invent its contents; other supplied images may still be visible.]` });
            }
        }
        result.push({ ...message, content: content.some(part => part.type === 'image_url') ? content
            : content.filter(part => part.type === 'text').map(part => part.text).join('\n') });
    }
    return { messages: result, deliveredImages, failures };
}
