import { openai } from "../../utils/openai";

/**
 * Embedding + importance scoring services. Both are fire-and-forget async
 * paths triggered when a message is indexed — failures never block the user
 * reply, and missing values gracefully degrade to keyword-only retrieval.
 */

const CF_WORKER_URL = (process.env.CF_WORKER_URL || '').replace(/\/+$/, '');
const CF_WORKER_TOKEN = process.env.CF_WORKER_TOKEN || '';

const EMBED_TIMEOUT_MS = 8_000;
const IMPORTANCE_TIMEOUT_MS = 8_000;
const IMPORTANCE_MODEL = 'deepseek-v4-flash';

/**
 * Get a 384-dim embedding for `text` via the Cloudflare Worker proxy.
 * Returns null on any failure — caller should treat null as "unembedded"
 * and skip semantic indexing for this message.
 */
export async function embedViaWorker(text: string): Promise<number[] | null> {
    if (!CF_WORKER_URL || !CF_WORKER_TOKEN) return null;
    const clean = (text || '').slice(0, 2000).trim();
    if (!clean) return null;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), EMBED_TIMEOUT_MS);
    try {
        const url = `${CF_WORKER_URL}/embed?text=${encodeURIComponent(clean)}`;
        const resp = await fetch(url, {
            signal: controller.signal,
            headers: { 'X-Hackerika-Token': CF_WORKER_TOKEN, 'Accept': 'application/json' },
        });
        if (!resp.ok) {
            // Common path: AI binding missing or rate-limited. Stay quiet on
            // first occurrence per process; otherwise we'd spam.
            return null;
        }
        const data: any = await resp.json();
        if (!data?.ok || !Array.isArray(data.embedding)) return null;
        return data.embedding as number[];
    } catch (error) {
        // Silent failure — embedding is a nice-to-have, not critical path.
        return null;
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Cosine similarity between two equal-length vectors. Returns 0 if shapes
 * don't match (defensive — shouldn't happen with consistent BGE-small output).
 */
export function cosineSimilarity(a: number[], b: number[]): number {
    if (!a || !b || a.length !== b.length || a.length === 0) return 0;
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
    }
    if (na === 0 || nb === 0) return 0;
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Score a message's importance 1-10 via the cheap flash model. Returns 5
 * (default neutral) on any failure so retrieval still works for that doc.
 *
 * Heuristic in the prompt:
 *   1-3  filler / acknowledgements / "lol"
 *   4-6  normal discussion / questions / casual help
 *   7-8  technical insights / decisions / vulnerabilities found
 *   9-10 critical announcements / lore-worthy moments
 */
export async function scoreImportance(content: string, authorDisplayName?: string): Promise<number> {
    const clean = (content || '').trim();
    if (!clean) return 1;
    // Skip the LLM call for trivial short messages — almost certainly filler.
    if (clean.length < 8) return 2;
    if (clean.length < 20 && /^(ok|oke|wkwk|hehe|lol|nih|iya|yes|no|👍|ya|gas|gw)\b/i.test(clean)) return 2;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), IMPORTANCE_TIMEOUT_MS);
    try {
        const completion = await openai.chat.completions.create(
            {
                model: IMPORTANCE_MODEL,
                messages: [
                    {
                        role: 'system',
                        content:
                            'Rate the importance of a Discord message on a 1-10 scale. Output ONLY a JSON object like {"importance": N}. ' +
                            'Anchor: 1-3 chit-chat/filler/acks ("lol", "ok", "gw setuju"). ' +
                            '4-6 normal discussion/questions/casual help. ' +
                            '7-8 technical insight, decision made, conflict, vulnerability found, important question. ' +
                            '9-10 critical announcements, role changes, CTF wins, lore-worthy moments. ' +
                            'No prose, just JSON.',
                    },
                    {
                        role: 'user',
                        content: `${authorDisplayName ? `[${authorDisplayName}] ` : ''}${clean.slice(0, 500)}`,
                    },
                ],
                response_format: { type: 'json_object' } as any,
                temperature: 0.1,
                max_tokens: 24,
                n: 1,
            },
            { signal: controller.signal },
        );
        const raw = completion.choices[0]?.message?.content?.trim() || '';
        try {
            const parsed = JSON.parse(raw);
            const v = Number(parsed?.importance);
            if (Number.isFinite(v)) return Math.max(1, Math.min(10, Math.round(v)));
        } catch { /* fall through */ }
        return 5;
    } catch (error) {
        return 5;
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Combined recency + importance + similarity scoring used by the search
 * services. All inputs normalized to [0, 1].
 *
 *   score = 0.5·semanticSim + 0.3·recencyDecay + 0.2·(importance/10)
 *
 * `recencyDecay` is `exp(-ageHours / halfLife)` — halves every 24h by default.
 */
export function combinedRecallScore(
    semanticSim: number,                // 0..1
    importance: number,                  // 1..10
    ageHours: number,                    // hours since message
    halfLifeHours: number = 24,
): number {
    const recencyDecay = Math.exp(-Math.log(2) * ageHours / halfLifeHours);
    const impNormalized = Math.max(0, Math.min(1, importance / 10));
    const simBounded = Math.max(0, Math.min(1, semanticSim));
    return 0.5 * simBounded + 0.3 * recencyDecay + 0.2 * impNormalized;
}
