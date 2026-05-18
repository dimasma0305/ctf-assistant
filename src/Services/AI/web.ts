import dns from "node:dns/promises";

/**
 * Web tools for Hackerika.
 *
 * - `webSearchForTool` hits TWO free DuckDuckGo endpoints in parallel:
 *   1. Instant Answer API (returns a Wikipedia-style summary for factual queries)
 *   2. HTML SERP (returns the actual top organic results)
 *   Neither requires a key, signup, or quota.
 *
 * - `fetchUrlForTool` downloads a URL and returns a plain-text extraction. It
 *   has SSRF protection: blocks private/loopback/link-local IPs and non-HTTP(S)
 *   schemes after DNS resolution, so a user can't make the bot scan its own
 *   internal Docker network.
 */

const SEARCH_TIMEOUT_MS = 12_000;
const FETCH_TIMEOUT_MS = 12_000;
const MAX_BODY_BYTES = 2 * 1024 * 1024;   // 2 MB cap on raw response body
const MAX_EXTRACT_CHARS = 6_000;          // chars handed to the model
const MAX_SEARCH_RESULTS = 8;
// Real-browser UA. Search engines aggressively block obvious bot identifiers
// from datacenter IPs, so we present as a stock Chrome on Windows. We still
// identify honestly when calling our own services or when an endpoint
// explicitly rewards bot transparency.
const BROWSER_UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Optional Cloudflare Worker proxy. When CF_WORKER_URL is set, we route both
// /search and /fetch through it — the worker runs from CF edge IPs which
// aren't on the search-engine blocklists this VPS is on, so the user can
// actually get results. The worker speaks the same JSON shape we return here,
// so swapping is transparent to callers. Falls back to direct scraping if
// env vars are unset (useful for local dev or if the worker is down).
const CF_WORKER_URL = (process.env.CF_WORKER_URL || '').replace(/\/+$/, '');
const CF_WORKER_TOKEN = process.env.CF_WORKER_TOKEN || '';

/* ─────────────────────── Small HTML helpers ─────────────────────── */

const HTML_ENTITY_MAP: Record<string, string> = {
    '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>',
    '&quot;': '"', '&apos;': "'", '&#39;': "'", '&hellip;': '…',
    '&mdash;': '—', '&ndash;': '–', '&laquo;': '«', '&raquo;': '»',
    '&copy;': '©', '&reg;': '®', '&trade;': '™',
};

function decodeEntities(s: string): string {
    let out = s;
    for (const [k, v] of Object.entries(HTML_ENTITY_MAP)) out = out.split(k).join(v);
    // Numeric entities
    out = out.replace(/&#(\d+);/g, (_, n: string) => {
        const code = parseInt(n, 10);
        return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : '';
    });
    out = out.replace(/&#x([0-9a-f]+);/gi, (_, n: string) => {
        const code = parseInt(n, 16);
        return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : '';
    });
    return out;
}

/** Strip HTML to plain text. Removes <script>/<style>/comments first so their
 *  contents don't survive as garbage. */
function stripHtml(html: string): string {
    return decodeEntities(
        html
            .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
            .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
            .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, ' ')
            .replace(/<!--[\s\S]*?-->/g, ' ')
            .replace(/<[^>]+>/g, ' ')
    ).replace(/\s+/g, ' ').trim();
}

function truncate(s: string, n: number): string {
    if (s.length <= n) return s;
    return s.slice(0, n - 1) + '…';
}

/* ─────────────────────── SSRF protection ─────────────────────── */

function isPrivateIp(ip: string): boolean {
    if (!ip) return true;
    // IPv4
    if (ip === '0.0.0.0') return true;
    if (ip.startsWith('127.')) return true;
    if (ip.startsWith('10.')) return true;
    if (/^172\.(1[6-9]|2[0-9]|3[01])\./.test(ip)) return true;
    if (ip.startsWith('192.168.')) return true;
    if (ip.startsWith('169.254.')) return true;        // link-local
    if (ip.startsWith('100.64.')) return true;         // CGNAT
    // IPv6
    if (ip === '::' || ip === '::1') return true;
    if (/^fe[89ab][0-9a-f]:/i.test(ip)) return true;   // link-local
    if (/^f[cd][0-9a-f]{2}:/i.test(ip)) return true;   // unique-local
    return false;
}

interface UrlGuardResult {
    ok: boolean;
    error?: 'invalid_url' | 'bad_scheme' | 'dns_lookup_failed' | 'private_target';
    resolvedHost?: string;
}

async function checkUrlSafe(urlStr: string): Promise<UrlGuardResult> {
    let u;
    try { u = new URL(urlStr); } catch { return { ok: false, error: 'invalid_url' }; }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        return { ok: false, error: 'bad_scheme' };
    }
    // Block bare-IP literals up front (catches `http://127.0.0.1`, `http://[::1]`).
    const hostNoBrackets = u.hostname.replace(/^\[|\]$/g, '');
    if (isPrivateIp(hostNoBrackets)) return { ok: false, error: 'private_target', resolvedHost: hostNoBrackets };
    // Then DNS-resolve the hostname and re-check, so `http://evil.com` resolving
    // to 127.0.0.1 still gets blocked.
    try {
        const { address } = await dns.lookup(u.hostname);
        if (isPrivateIp(address)) return { ok: false, error: 'private_target', resolvedHost: address };
        return { ok: true, resolvedHost: address };
    } catch {
        return { ok: false, error: 'dns_lookup_failed' };
    }
}

/* ─────────────────────── DuckDuckGo Instant Answer ─────────────────────── */

interface InstantAnswer {
    abstract?: string;
    abstractSource?: string;
    abstractUrl?: string;
    answer?: string;
    answerType?: string;
}

async function fetchInstantAnswer(query: string, signal: AbortSignal): Promise<InstantAnswer | null> {
    try {
        const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1&t=hackerika`;
        const resp = await fetch(url, {
            signal,
            headers: { 'User-Agent': BROWSER_UA, 'Accept': 'application/json' },
            redirect: 'follow',
        });
        if (!resp.ok) return null;
        const data: any = await resp.json();
        const out: InstantAnswer = {};
        if (typeof data.AbstractText === 'string' && data.AbstractText.trim()) {
            out.abstract = truncate(data.AbstractText.trim(), 1200);
        }
        if (typeof data.AbstractSource === 'string' && data.AbstractSource) out.abstractSource = data.AbstractSource;
        if (typeof data.AbstractURL === 'string' && data.AbstractURL) out.abstractUrl = data.AbstractURL;
        if (typeof data.Answer === 'string' && data.Answer.trim()) {
            out.answer = truncate(String(data.Answer).trim(), 600);
            if (typeof data.AnswerType === 'string') out.answerType = data.AnswerType;
        }
        return out;
    } catch {
        return null;
    }
}

/* ─────────────────────── Mojeek SERP scrape ─────────────────────── */
//
// Why Mojeek and not DuckDuckGo: DDG's html.duckduckgo.com hard-blocks our
// datacenter IP — every request returns HTTP 202 with an "anomaly" page,
// regardless of UA / POST / form-encoding. Mojeek runs its own independent
// crawler/index, has stable HTML structure (no SPA), and accepts requests
// from VPS IPs. The Instant Answer API (`api.duckduckgo.com`) still works
// for abstracts and is called in parallel above.
//
// Each Mojeek result row looks like:
//   <li class="r1">
//     <a class="ob" href="URL">...favicon...</a>
//     <h2><a class="title" href="URL" title="URL">Title text</a></h2>
//     <p class="s">Snippet text</p>
//   </li>

export interface SearchResultRow {
    title: string;
    url: string;
    snippet: string;
}

function parseMojeekHtml(html: string, maxResults: number): SearchResultRow[] {
    const results: SearchResultRow[] = [];
    // Split into <li class="rN"> chunks. Mojeek numbers them r1..r10.
    const chunks = html.split(/<li class="r\d+"/i);
    for (let i = 1; i < chunks.length && results.length < maxResults; i++) {
        const chunk = chunks[i].slice(0, 6000);
        // Pull the title link — there can be two anchors with the same href
        // (the favicon one with class="ob" and the title one with class="title").
        // We take the one with class="title" so the inner text is the readable title.
        const titleMatch = chunk.match(/<a\s+class="title"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
        if (!titleMatch) continue;
        const url = titleMatch[1].replace(/&amp;/g, '&');
        if (!/^https?:\/\//i.test(url)) continue;
        const title = stripHtml(titleMatch[2]);
        if (!title) continue;
        let snippet = '';
        const snippetMatch = chunk.match(/<p\s+class="s">([\s\S]*?)<\/p>/i);
        if (snippetMatch) snippet = stripHtml(snippetMatch[1]);
        results.push({ title, url, snippet: truncate(snippet, 280) });
    }
    return results;
}

interface SerpFetchResult {
    results: SearchResultRow[];
    error?: 'blocked' | 'http_error' | 'fetch_failed';
    httpStatus?: number;
}

async function fetchMojeekResults(
    query: string,
    maxResults: number,
    signal: AbortSignal,
): Promise<SerpFetchResult> {
    try {
        const url = `https://www.mojeek.com/search?q=${encodeURIComponent(query)}`;
        const resp = await fetch(url, {
            signal,
            headers: {
                'User-Agent': BROWSER_UA,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
                'Referer': 'https://www.mojeek.com/',
            },
            redirect: 'follow',
        });
        if (resp.status === 403 || resp.status === 429) {
            // Mojeek's anti-automated-query page. Return a typed signal so the
            // caller can surface a useful note to the model rather than a
            // silent empty.
            return { results: [], error: 'blocked', httpStatus: resp.status };
        }
        if (!resp.ok) return { results: [], error: 'http_error', httpStatus: resp.status };
        const body = await resp.text();
        return { results: parseMojeekHtml(body, maxResults) };
    } catch {
        return { results: [], error: 'fetch_failed' };
    }
}

/* ─────────────────────── Tool: web_search ─────────────────────── */

export interface WebSearchArgs {
    query?: string;
    maxResults?: number;
}
export interface WebSearchResult {
    ok: boolean;
    error?: 'missing_query';
    query?: string;
    instant?: InstantAnswer;
    results?: SearchResultRow[];
    note?: string;
}

/**
 * Route a search through the Cloudflare Worker proxy. Returns null if the
 * worker isn't configured (caller falls back to direct scraping).
 */
async function workerSearch(query: string, cap: number, signal: AbortSignal): Promise<WebSearchResult | null> {
    if (!CF_WORKER_URL || !CF_WORKER_TOKEN) return null;
    try {
        const url = `${CF_WORKER_URL}/search?q=${encodeURIComponent(query)}&max=${cap}`;
        const resp = await fetch(url, {
            signal,
            headers: { 'X-Hackerika-Token': CF_WORKER_TOKEN, 'Accept': 'application/json' },
        });
        if (resp.status === 401) {
            console.error('[Web] worker auth failed — check CF_WORKER_TOKEN');
            return null;
        }
        if (!resp.ok) {
            console.error(`[Web] worker returned HTTP ${resp.status}`);
            return null;
        }
        const data: any = await resp.json();
        // Worker returns the same shape we promise: { ok, query, instant?, results?, note? }.
        // Pass it through as-is so the model sees consistent output.
        return {
            ok: !!data?.ok,
            query: data?.query || query,
            instant: data?.instant,
            results: data?.results,
            note: data?.note,
        };
    } catch (error) {
        console.error('[Web] worker fetch failed:', error);
        return null;
    }
}

export async function webSearchForTool(args: WebSearchArgs): Promise<WebSearchResult> {
    const query = (args?.query || '').trim();
    if (!query) return { ok: false, error: 'missing_query' };
    const cap = Math.max(1, Math.min(MAX_SEARCH_RESULTS, Number(args?.maxResults) || 5));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
    try {
        // Prefer the CF Worker proxy when configured — its edge IPs aren't
        // on search engine blocklists and we get real results. If unset or
        // the worker itself is down, fall through to direct scraping.
        const viaWorker = await workerSearch(query, cap, controller.signal);
        if (viaWorker) {
            console.log(
                `🌐 [Web] worker-search "${truncate(query, 60)}" → ` +
                `instant=${viaWorker.instant ? 'y' : 'n'} results=${viaWorker.results?.length ?? 0}` +
                (viaWorker.note ? ` note=${truncate(viaWorker.note, 80)}` : ''),
            );
            return viaWorker;
        }
        // Fire both endpoints in parallel:
        //   - DDG Instant Answer API → factual abstracts (Wikipedia-style)
        //   - Mojeek SERP → top organic results (independent crawler)
        const [instant, serp] = await Promise.all([
            fetchInstantAnswer(query, controller.signal),
            fetchMojeekResults(query, cap, controller.signal),
        ]);
        const out: WebSearchResult = { ok: true, query };
        if (instant && (instant.abstract || instant.answer)) out.instant = instant;
        if (serp.results.length > 0) out.results = serp.results;
        if (!out.instant && !out.results) {
            if (serp.error === 'blocked') {
                out.note =
                    `search_engine_blocked: Mojeek refused this query (status ${serp.httpStatus || '?'}); ` +
                    `try a slightly different keyword phrasing, or skip if not critical`;
            } else if (serp.error === 'fetch_failed' || serp.error === 'http_error') {
                out.note = `search_engine_unavailable: status=${serp.httpStatus || 'network'}`;
            } else {
                out.note = 'no_results: query produced no instant answer and no organic results';
            }
        }
        console.log(
            `🌐 [Web] search "${truncate(query, 60)}" → ` +
            `instant=${out.instant ? 'y' : 'n'} results=${serp.results.length}` +
            (serp.error ? ` serp_error=${serp.error}(${serp.httpStatus || '?'})` : ''),
        );
        return out;
    } finally {
        clearTimeout(timer);
    }
}

/* ─────────────────────── Tool: fetch_url ─────────────────────── */

export interface FetchUrlArgs {
    url?: string;
}
export interface FetchUrlResult {
    ok: boolean;
    error?:
        | 'missing_url'
        | 'invalid_url'
        | 'bad_scheme'
        | 'private_target'
        | 'dns_lookup_failed'
        | 'http_error'
        | 'non_text_content'
        | 'body_too_large'
        | 'fetch_failed'
        | 'empty_content';
    status?: number;
    finalUrl?: string;
    contentType?: string;
    title?: string;
    content?: string;
    truncated?: boolean;
}

function extractTitle(html: string): string | undefined {
    const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (!m) return undefined;
    const t = stripHtml(m[1]);
    return t ? truncate(t, 200) : undefined;
}

/**
 * Route a URL fetch through the Cloudflare Worker proxy. Returns null if the
 * worker isn't configured (caller falls back to direct fetch with SSRF guard).
 */
async function workerFetch(target: string, signal: AbortSignal): Promise<FetchUrlResult | null> {
    if (!CF_WORKER_URL || !CF_WORKER_TOKEN) return null;
    try {
        const url = `${CF_WORKER_URL}/fetch?url=${encodeURIComponent(target)}`;
        const resp = await fetch(url, {
            signal,
            headers: { 'X-Hackerika-Token': CF_WORKER_TOKEN, 'Accept': 'application/json' },
        });
        if (resp.status === 401) {
            console.error('[Web] worker auth failed — check CF_WORKER_TOKEN');
            return null;
        }
        if (!resp.ok && resp.status !== 200) {
            console.error(`[Web] worker /fetch returned HTTP ${resp.status}`);
            return null;
        }
        const data: any = await resp.json();
        return data as FetchUrlResult;
    } catch (error) {
        console.error('[Web] worker /fetch failed:', error);
        return null;
    }
}

export async function fetchUrlForTool(args: FetchUrlArgs): Promise<FetchUrlResult> {
    const target = (args?.url || '').trim();
    if (!target) return { ok: false, error: 'missing_url' };

    // CF Worker path: skips the local SSRF guard because the worker runs in
    // CF's network (not ours) and can't pivot into our internal services.
    if (CF_WORKER_URL && CF_WORKER_TOKEN) {
        const ctlW = new AbortController();
        const timerW = setTimeout(() => ctlW.abort(), FETCH_TIMEOUT_MS);
        try {
            const viaWorker = await workerFetch(target, ctlW.signal);
            if (viaWorker) {
                console.log(
                    `🌐 [Web] worker-fetch ${truncate(target, 80)} → ` +
                    (viaWorker.ok ? `${viaWorker.contentType || '?'} ${viaWorker.content?.length || 0} chars` : `error=${viaWorker.error}`),
                );
                return viaWorker;
            }
        } finally {
            clearTimeout(timerW);
        }
        // Worker failed — fall through to direct path below.
    }

    const guard = await checkUrlSafe(target);
    if (!guard.ok) return { ok: false, error: guard.error };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        const resp = await fetch(target, {
            signal: controller.signal,
            headers: {
                'User-Agent': BROWSER_UA,
                'Accept': 'text/html,application/xhtml+xml,application/json,text/plain;q=0.9,*/*;q=0.1',
                'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
            },
            redirect: 'follow',
        });

        if (!resp.ok) {
            return { ok: false, error: 'http_error', status: resp.status, finalUrl: resp.url };
        }

        // Re-check the final URL after redirects — DNS could differ.
        if (resp.url && resp.url !== target) {
            const reGuard = await checkUrlSafe(resp.url);
            if (!reGuard.ok) return { ok: false, error: reGuard.error, finalUrl: resp.url };
        }

        const contentType = resp.headers.get('content-type') || '';
        const isText =
            contentType.startsWith('text/') ||
            contentType.includes('json') ||
            contentType.includes('xml') ||
            contentType.includes('xhtml');
        if (!isText) {
            return { ok: false, error: 'non_text_content', contentType, finalUrl: resp.url };
        }

        // Read body with size cap. We pull as a stream so a 500MB download
        // can't OOM the container.
        const reader = resp.body?.getReader();
        if (!reader) return { ok: false, error: 'fetch_failed' };
        const chunks: Uint8Array[] = [];
        let total = 0;
        let exceeded = false;
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
                total += value.byteLength;
                if (total > MAX_BODY_BYTES) {
                    exceeded = true;
                    try { await reader.cancel(); } catch {}
                    break;
                }
                chunks.push(value);
            }
        }
        if (exceeded && total > MAX_BODY_BYTES * 1.1) {
            return { ok: false, error: 'body_too_large', finalUrl: resp.url, contentType };
        }
        const raw = new TextDecoder('utf-8', { fatal: false }).decode(
            Buffer.concat(chunks.map((c) => Buffer.from(c))),
        );

        const isHtml = contentType.includes('html') || /<html[\s>]/i.test(raw.slice(0, 1024));
        const title = isHtml ? extractTitle(raw) : undefined;
        const text = isHtml ? stripHtml(raw) : raw.replace(/\s+/g, ' ').trim();
        if (!text) return { ok: false, error: 'empty_content', finalUrl: resp.url, contentType };

        const truncated = text.length > MAX_EXTRACT_CHARS;
        const content = truncate(text, MAX_EXTRACT_CHARS);

        console.log(
            `🌐 [Web] fetched ${resp.url || target} → ${contentType.split(';')[0]} ${total}B → ${content.length} chars`,
        );

        return {
            ok: true,
            status: resp.status,
            finalUrl: resp.url || target,
            contentType: contentType.split(';')[0],
            title,
            content,
            truncated,
        };
    } catch (error: any) {
        if (error?.name === 'AbortError' || controller.signal.aborted) {
            return { ok: false, error: 'fetch_failed' };
        }
        console.error('[Web] fetch failed:', error);
        return { ok: false, error: 'fetch_failed' };
    } finally {
        clearTimeout(timer);
    }
}
