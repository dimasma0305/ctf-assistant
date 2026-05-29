/**
 * Embedding + importance scoring services. Triggered when a message is indexed —
 * failures never block the user reply, and missing values gracefully degrade to
 * keyword-only retrieval. Importance is a fast LOCAL heuristic (no LLM call);
 * only the embedding makes a network round-trip.
 */

const CF_WORKER_URL = (process.env.CF_WORKER_URL || '').replace(/\/+$/, '');
const CF_WORKER_TOKEN = process.env.CF_WORKER_TOKEN || '';

const EMBED_TIMEOUT_MS = 8_000;

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
 * Score a message's importance 1-10 with a fast LOCAL heuristic — NO LLM call.
 *
 * Previously this fired a deepseek-v4-flash completion for EVERY indexed message
 * (i.e. nearly every message in every channel), which was pure background cost +
 * rate-limit pressure at server scale. Since `combinedRecallScore` only weights
 * importance at 0.2, a cheap deterministic approximation is more than good enough
 * for recall ranking. Signal markers:
 *   1-3  filler / acks / very short
 *   4-6  normal discussion / questions
 *   7-10 technical content: code, payloads, CVEs, flags, links, long explanations
 */
export function scoreImportance(content: string, _authorDisplayName?: string): number {
    const text = (content || '').trim();
    if (!text) return 1;
    const len = text.length;
    if (len < 8) return 2;
    // Short filler / acknowledgements.
    if (len < 20 && /^(ok|oke|sip|siap|wkwk|hehe|lol|nih|iya|yes|no|👍|ya|gas|gw|noted|mantap)\b/i.test(text)) return 2;

    const lower = text.toLowerCase();
    let score = 4; // normal-discussion baseline

    if (/```|`[^`]+`/.test(text)) score += 3;                              // code block / inline code
    if (/\bhttps?:\/\/\S+/i.test(text)) score += 1;                        // link / resource
    if (/\bcve-\d{4}-\d{3,}\b/i.test(lower)) score += 3;                    // CVE reference
    if (/(flag|ctf|tcp1p|fakeflag)\{[^}]*\}/i.test(text)) score += 3;       // flag value
    if (/\b(payload|exploit|vuln|rce|sqli|xss|ssrf|lfi|xxe|overflow|bypass|race condition|deserial|jwt|writeup|0day)\b/i.test(lower)) score += 2;
    if (text.includes('?')) score += 1;                                    // a question
    if (len > 280) score += 1;                                             // substantial explanation
    if (len > 700) score += 1;

    return Math.max(1, Math.min(10, score));
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
