/**
 * Hackerika search proxy — Cloudflare Worker.
 *
 * Why this exists: the bot runs from a datacenter VPS whose IP is on multiple
 * search engines' anti-bot blocklists (DDG html, Mojeek, etc. all 403 us). CF
 * Workers run from CF edge IPs, which carry a different reputation profile and
 * sail through. The bot makes one HTTPS call to this worker; the worker does
 * the actual scraping from edge and returns JSON.
 *
 * Endpoints:
 *   GET /search?q=<query>&max=<N>  → JSON { ok, query, instant, results }
 *   GET /fetch?url=<url>           → JSON { ok, status, content, title, ... }
 *   GET /                          → liveness probe (no auth)
 *
 * Auth: every authenticated endpoint requires header `X-Hackerika-Token`
 * matching the `SHARED_SECRET` env var (encrypted at-rest by CF). Without
 * auth a random web stranger could ride your free-tier quota.
 *
 * Free tier: 100k requests / day on workers.dev. More than enough for a
 * Discord bot. CPU time per request capped at 10ms on free tier — we stream
 * + parse small bodies, well under the limit.
 */

const BROWSER_UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const MAX_RESULTS_CAP = 10;
const MAX_BODY_BYTES = 2 * 1024 * 1024;     // 2 MB on /fetch
const MAX_EXTRACT_CHARS = 6000;
const FETCH_TIMEOUT_MS = 12_000;

function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    });
}

function authOk(request, env) {
    const provided = request.headers.get('X-Hackerika-Token') || '';
    const expected = env.SHARED_SECRET || '';
    return expected && provided === expected;
}

/* ── shared HTML helpers ── */

const HTML_ENTITY_MAP = {
    '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>',
    '&quot;': '"', '&apos;': "'", '&#39;': "'", '&hellip;': '…',
    '&mdash;': '—', '&ndash;': '–',
};
function decodeEntities(s) {
    let out = s;
    for (const [k, v] of Object.entries(HTML_ENTITY_MAP)) out = out.split(k).join(v);
    out = out.replace(/&#(\d+);/g, (_, n) => {
        const c = parseInt(n, 10);
        return Number.isFinite(c) && c > 0 && c < 0x110000 ? String.fromCodePoint(c) : '';
    });
    out = out.replace(/&#x([0-9a-f]+);/gi, (_, n) => {
        const c = parseInt(n, 16);
        return Number.isFinite(c) && c > 0 && c < 0x110000 ? String.fromCodePoint(c) : '';
    });
    return out;
}
function stripHtml(html) {
    return decodeEntities(
        html
            .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
            .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
            .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, ' ')
            .replace(/<!--[\s\S]*?-->/g, ' ')
            .replace(/<[^>]+>/g, ' ')
    ).replace(/\s+/g, ' ').trim();
}
function truncate(s, n) {
    return s.length <= n ? s : s.slice(0, n - 1) + '…';
}

/* ── DDG Instant Answer (still works, returns Wikipedia-style abstract) ── */

async function ddgInstant(query, signal) {
    try {
        const r = await fetch(
            `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1&t=hackerika`,
            { signal, headers: { 'User-Agent': BROWSER_UA, 'Accept': 'application/json' } },
        );
        if (!r.ok) return null;
        const d = await r.json();
        const out = {};
        if (typeof d.AbstractText === 'string' && d.AbstractText.trim()) {
            out.abstract = truncate(d.AbstractText.trim(), 1200);
        }
        if (typeof d.AbstractSource === 'string' && d.AbstractSource) out.abstractSource = d.AbstractSource;
        if (typeof d.AbstractURL === 'string' && d.AbstractURL) out.abstractUrl = d.AbstractURL;
        if (typeof d.Answer === 'string' && d.Answer.trim()) {
            out.answer = truncate(String(d.Answer).trim(), 600);
            if (typeof d.AnswerType === 'string') out.answerType = d.AnswerType;
        }
        return Object.keys(out).length ? out : null;
    } catch {
        return null;
    }
}

/* ── DDG HTML SERP (works from CF edge IP) ── */

function unwrapDdgRedirect(href) {
    let h = href;
    if (h.startsWith('//')) h = 'https:' + h;
    try {
        const u = new URL(h);
        const uddg = u.searchParams.get('uddg');
        if (uddg) return decodeURIComponent(uddg);
    } catch {}
    return h;
}
// Skip DDG sponsored / ad results — they go through y.js with ad_provider /
// ad_domain params, and the post-unwrap URL is also recognisable.
function isDdgAd(rawHref, unwrappedUrl, chunk) {
    if (/y\.js\?ad_/i.test(rawHref)) return true;
    if (/duckduckgo\.com\/y\.js/i.test(unwrappedUrl)) return true;
    if (/[?&]ad_(provider|domain|ai|type)=/i.test(unwrappedUrl)) return true;
    if (/class="result__type"[^>]*>\s*(Ad|Sponsored)/i.test(chunk)) return true;
    return false;
}

function parseDdgHtml(html, max) {
    const results = [];
    const chunks = html.split(/<div\s+class="result\s+results_links/i);
    for (let i = 1; i < chunks.length && results.length < max; i++) {
        const chunk = chunks[i].slice(0, 6000);
        // Skip ad-shaped result containers up front.
        if (/result\s+results_links\s+result--ad/i.test(chunk.slice(0, 200))) continue;
        const title = chunk.match(/<a\b[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
        if (!title) continue;
        const rawHref = title[1].replace(/&amp;/g, '&');
        const url = unwrapDdgRedirect(rawHref);
        if (!/^https?:\/\//i.test(url)) continue;
        if (isDdgAd(rawHref, url, chunk)) continue;
        let snippet = '';
        const sA = chunk.match(/<a\b[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i);
        if (sA) snippet = stripHtml(sA[1]);
        else {
            const sD = chunk.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/(?:div|td|span)>/i);
            if (sD) snippet = stripHtml(sD[1]);
        }
        const ttl = stripHtml(title[2]);
        if (!ttl) continue;
        results.push({ title: ttl, url, snippet: truncate(snippet, 280) });
    }
    return results;
}
async function ddgSerp(query, max, signal) {
    try {
        // POST is more accepted than GET on html.ddg, and CF edge IPs aren't blocklisted.
        const body = new URLSearchParams({ q: query, b: '', kl: 'wt-wt' });
        const r = await fetch('https://html.duckduckgo.com/html/', {
            method: 'POST',
            signal,
            headers: {
                'User-Agent': BROWSER_UA,
                'Accept': 'text/html,application/xhtml+xml',
                'Accept-Language': 'en-US,en;q=0.9',
                'Content-Type': 'application/x-www-form-urlencoded',
                'Origin': 'https://duckduckgo.com',
                'Referer': 'https://duckduckgo.com/',
            },
            body: body.toString(),
        });
        if (!r.ok) return { results: [], error: r.status === 403 || r.status === 429 ? 'blocked' : 'http_error', httpStatus: r.status };
        const html = await r.text();
        return { results: parseDdgHtml(html, max) };
    } catch {
        return { results: [], error: 'fetch_failed' };
    }
}

/* ── Mojeek fallback (also works from CF edge) ── */

function parseMojeek(html, max) {
    const results = [];
    const chunks = html.split(/<li class="r\d+"/i);
    for (let i = 1; i < chunks.length && results.length < max; i++) {
        const chunk = chunks[i].slice(0, 6000);
        const t = chunk.match(/<a\s+class="title"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
        if (!t) continue;
        const url = t[1].replace(/&amp;/g, '&');
        if (!/^https?:\/\//i.test(url)) continue;
        const title = stripHtml(t[2]);
        if (!title) continue;
        let snippet = '';
        const sm = chunk.match(/<p\s+class="s">([\s\S]*?)<\/p>/i);
        if (sm) snippet = stripHtml(sm[1]);
        results.push({ title, url, snippet: truncate(snippet, 280) });
    }
    return results;
}
async function mojeekSerp(query, max, signal) {
    try {
        const r = await fetch(`https://www.mojeek.com/search?q=${encodeURIComponent(query)}`, {
            signal,
            headers: {
                'User-Agent': BROWSER_UA,
                'Accept': 'text/html,application/xhtml+xml',
                'Accept-Language': 'en-US,en;q=0.9',
                'Referer': 'https://www.mojeek.com/',
            },
        });
        if (!r.ok) return { results: [], error: r.status === 403 || r.status === 429 ? 'blocked' : 'http_error', httpStatus: r.status };
        return { results: parseMojeek(await r.text(), max) };
    } catch {
        return { results: [], error: 'fetch_failed' };
    }
}

/* ── /search handler ── */

async function handleSearch(query, max) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
    try {
        // Try DDG SERP first; if it returns 0 results, try Mojeek. Also run
        // Instant Answer API in parallel since it's free and fast.
        const [instant, ddg] = await Promise.all([
            ddgInstant(query, ctl.signal),
            ddgSerp(query, max, ctl.signal),
        ]);
        let serp = ddg;
        if (serp.results.length === 0) {
            serp = await mojeekSerp(query, max, ctl.signal);
        }
        const out = { ok: true, query };
        if (instant) out.instant = instant;
        if (serp.results.length > 0) {
            out.results = serp.results;
            out.engine = ddg.results.length > 0 ? 'duckduckgo' : 'mojeek';
        } else {
            out.engine = 'none';
            if (serp.error === 'blocked') {
                out.note = `both engines blocked (ddg=${ddg.httpStatus || '?'}, mojeek=${serp.httpStatus || '?'})`;
            } else if (!instant) {
                out.note = 'no results';
            }
        }
        return json(out);
    } finally {
        clearTimeout(timer);
    }
}

/* ── /fetch handler ── */

function extractTitle(html) {
    const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (!m) return undefined;
    const t = stripHtml(m[1]);
    return t ? truncate(t, 200) : undefined;
}

async function handleFetch(target) {
    let u;
    try { u = new URL(target); } catch { return json({ ok: false, error: 'invalid_url' }, 400); }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return json({ ok: false, error: 'bad_scheme' }, 400);

    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
    try {
        const r = await fetch(target, {
            signal: ctl.signal,
            headers: {
                'User-Agent': BROWSER_UA,
                'Accept': 'text/html,application/xhtml+xml,application/json,text/plain;q=0.9,*/*;q=0.1',
                'Accept-Language': 'en-US,en;q=0.9',
            },
            redirect: 'follow',
        });
        if (!r.ok) return json({ ok: false, error: 'http_error', status: r.status, finalUrl: r.url }, 200);
        const ct = (r.headers.get('content-type') || '').toLowerCase();
        const isText = ct.startsWith('text/') || ct.includes('json') || ct.includes('xml') || ct.includes('xhtml');
        if (!isText) return json({ ok: false, error: 'non_text_content', contentType: ct.split(';')[0], finalUrl: r.url });

        // Streamed read with size cap
        const reader = r.body && r.body.getReader && r.body.getReader();
        if (!reader) return json({ ok: false, error: 'fetch_failed' });
        const chunks = [];
        let total = 0;
        let exceeded = false;
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
                total += value.byteLength;
                if (total > MAX_BODY_BYTES) { exceeded = true; try { await reader.cancel(); } catch {} ; break; }
                chunks.push(value);
            }
        }
        if (exceeded) return json({ ok: false, error: 'body_too_large', finalUrl: r.url, contentType: ct.split(';')[0] });
        const raw = new TextDecoder('utf-8', { fatal: false }).decode(concatChunks(chunks));

        const isHtml = ct.includes('html') || /<html[\s>]/i.test(raw.slice(0, 1024));
        const title = isHtml ? extractTitle(raw) : undefined;
        const text = isHtml ? stripHtml(raw) : raw.replace(/\s+/g, ' ').trim();
        if (!text) return json({ ok: false, error: 'empty_content', finalUrl: r.url, contentType: ct.split(';')[0] });

        return json({
            ok: true,
            status: r.status,
            finalUrl: r.url || target,
            contentType: ct.split(';')[0],
            title,
            content: truncate(text, MAX_EXTRACT_CHARS),
            truncated: text.length > MAX_EXTRACT_CHARS,
        });
    } catch (e) {
        return json({ ok: false, error: 'fetch_failed' });
    } finally {
        clearTimeout(timer);
    }
}

function concatChunks(chunks) {
    let total = 0;
    for (const c of chunks) total += c.byteLength;
    const out = new Uint8Array(total);
    let i = 0;
    for (const c of chunks) { out.set(c, i); i += c.byteLength; }
    return out;
}

/* ── entry ── */

export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        // Liveness probe — no auth, just confirms worker is up.
        if (url.pathname === '/' || url.pathname === '/health') {
            return json({ ok: true, name: 'hackerika-search', version: 1 });
        }

        if (!authOk(request, env)) {
            return json({ ok: false, error: 'unauthorized' }, 401);
        }

        if (url.pathname === '/search') {
            const q = (url.searchParams.get('q') || '').trim();
            if (!q) return json({ ok: false, error: 'missing_q' }, 400);
            const max = Math.max(1, Math.min(MAX_RESULTS_CAP, parseInt(url.searchParams.get('max') || '5', 10) || 5));
            return handleSearch(q, max);
        }

        if (url.pathname === '/fetch') {
            const t = (url.searchParams.get('url') || '').trim();
            if (!t) return json({ ok: false, error: 'missing_url' }, 400);
            return handleFetch(t);
        }

        return json({ ok: false, error: 'not_found' }, 404);
    },
};
