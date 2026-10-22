import { createHash } from 'node:crypto';
import type { Job } from './protocol';

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 7 * 1024 * 1024;

export async function generateJobImage(job: Job, input: unknown, options: {
  key?: string; fetcher?: typeof fetch; signal?: AbortSignal; model?: string;
} = {}): Promise<Response> {
  const prompt = typeof (input as any)?.prompt === 'string' ? (input as any).prompt.trim() : '';
  if (!prompt || prompt.length > 6000) return Response.json({ error: 'invalid_image_prompt' }, { status: 400 });
  const key = options.key ?? process.env.OPENAI_IMAGE_API_KEY;
  if (!key) return Response.json({ error: 'image_generation_unavailable' }, { status: 503 });
  const model = options.model || process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2.5-flare';
  if (!['gpt-image-2.5-flare', 'gpt-image-2.5-sunburst', 'gpt-image-2', 'gpt-image-1-mini'].includes(model))
    return Response.json({ error: 'image_model_invalid' }, { status: 503 });
  const safetyIdentifier = createHash('sha256').update(`hackerika:${job.packet.guildId}:${job.packet.userId}`).digest('hex');
  let upstream: Response;
  try {
    upstream = await (options.fetcher || fetch)('https://api.openai.com/v1/images/generations', {
      method: 'POST', redirect: 'error',
      signal: AbortSignal.any([...(options.signal ? [options.signal] : []), AbortSignal.timeout(180_000)]),
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, size: '1536x1024', quality: 'low',
        n: 1, output_format: 'webp', output_compression: 80, safety_identifier: safetyIdentifier })
    });
  } catch { return Response.json({ error: 'image_provider_unavailable' }, { status: 502 }); }
  if (!upstream.ok) {
    await upstream.body?.cancel().catch(() => {});
    const error = upstream.status === 401 ? 'image_api_key_invalid'
      : upstream.status === 429 ? 'image_api_limit' : upstream.status === 400 ? 'image_request_rejected' : 'image_provider_unavailable';
    return Response.json({ error }, { status: upstream.status === 400 ? 400 : 503 });
  }
  const declared = Number(upstream.headers.get('content-length') || 0);
  if (declared > MAX_RESPONSE_BYTES) { await upstream.body?.cancel().catch(() => {}); return Response.json({ error: 'image_too_large' }, { status: 502 }); }
  const reader = upstream.body?.getReader();
  if (!reader) return Response.json({ error: 'image_provider_unavailable' }, { status: 502 });
  const chunks: Uint8Array[] = []; let received = 0;
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      received += value.byteLength;
      if (received > MAX_RESPONSE_BYTES) return Response.json({ error: 'image_too_large' }, { status: 502 });
      chunks.push(value);
    }
  } catch { return Response.json({ error: 'image_provider_unavailable' }, { status: 502 }); }
  finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  let payload: any;
  try { payload = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { return Response.json({ error: 'image_provider_unavailable' }, { status: 502 }); }
  const base64 = payload?.data?.[0]?.b64_json;
  if (typeof base64 !== 'string' || base64.length > Math.ceil(MAX_IMAGE_BYTES * 4 / 3) + 4
    || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64))
    return Response.json({ error: 'image_provider_invalid_output' }, { status: 502 });
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length < 16 || bytes.length > MAX_IMAGE_BYTES || bytes.subarray(0, 4).toString() !== 'RIFF'
    || bytes.subarray(8, 12).toString() !== 'WEBP')
    return Response.json({ error: 'image_provider_invalid_output' }, { status: 502 });
  return new Response(new Uint8Array(bytes), { headers: { 'Content-Type': 'image/webp',
    'Content-Disposition': 'attachment; filename="generated-image.webp"', 'Cache-Control': 'no-store' } });
}
