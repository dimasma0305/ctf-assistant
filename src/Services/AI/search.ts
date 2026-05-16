import { OmitPartialGroupDMChannel, Message as DiscordMessage, TextChannel, NewsChannel, ThreadChannel } from "discord.js";
import { MessageCacheModel } from "../../Database/connect";

const MAX_SEARCH_RESULTS = 8;             // hard cap on result rows fed back to the model
const MAX_RESULT_CONTENT_CHARS = 220;     // per-message truncation in the results block
const DISCORD_FALLBACK_LIMIT = 100;       // how many recent messages to pull when cache is sparse
const MIN_CACHE_HITS = 3;                 // if cache returns fewer matches than this, fall back to API fetch

/**
 * Match `[SEARCH: query]` anywhere in the model output. Like the fan-role
 * token, we ignore tokens inside fenced code blocks so pasted code can't
 * trigger an unwanted search.
 */
const SEARCH_REGEX = /\[\s*SEARCH\s*:\s*([^\]\n]{1,200})\]/i;

export interface SearchSignal {
    shouldSearch: boolean;
    query: string;
    cleaned: string;
}

export function parseSearchSignal(modelOutput: string): SearchSignal {
    const withoutFences = modelOutput.replace(/```[\s\S]*?```/g, '');
    const match = withoutFences.match(SEARCH_REGEX);
    if (!match) {
        return { shouldSearch: false, query: '', cleaned: modelOutput };
    }
    const query = (match[1] || '').trim();
    const cleaned = modelOutput.replace(SEARCH_REGEX, '').replace(/\n{3,}/g, '\n\n').trim();
    return { shouldSearch: query.length > 0, query, cleaned };
}

interface RawHit {
    authorName: string;
    content: string;
    createdTimestamp: number;
    source: 'cache' | 'discord';
}

function relativeTime(ts: number): string {
    const diff = Date.now() - ts;
    const sec = Math.floor(diff / 1000);
    if (sec < 60) return `${sec}s ago`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const days = Math.floor(hr / 24);
    if (days < 7) return `${days}d ago`;
    const wk = Math.floor(days / 7);
    return `${wk}w ago`;
}

function truncate(s: string, n: number): string {
    return s.length <= n ? s : s.slice(0, n - 1) + '…';
}

/**
 * Tokenize the query into lowercase word fragments. A message must contain
 * ALL of them (substring, case-insensitive) to be considered a match.
 * Quoted phrases are kept intact: `[SEARCH: "race condition" exploit]`.
 */
function tokenizeQuery(query: string): string[] {
    const tokens: string[] = [];
    const quotedRegex = /"([^"]+)"|(\S+)/g;
    let m: RegExpExecArray | null;
    while ((m = quotedRegex.exec(query)) !== null) {
        const tok = (m[1] || m[2] || '').toLowerCase();
        if (tok.length >= 2) tokens.push(tok);
    }
    return tokens;
}

function matchesAll(content: string, tokens: string[]): boolean {
    if (tokens.length === 0) return false;
    const lower = content.toLowerCase();
    return tokens.every((t) => lower.includes(t));
}

async function searchCache(channelId: string, tokens: string[]): Promise<RawHit[]> {
    const cache = await MessageCacheModel.findOne({ channelId }).lean();
    if (!cache || !cache.messages) return [];
    const messages = cache.messages as any[];
    const hits: RawHit[] = [];
    for (const m of messages) {
        const content = m.content || '';
        if (!matchesAll(content, tokens)) continue;
        hits.push({
            authorName: m.member?.displayName || m.author?.username || 'unknown',
            content,
            createdTimestamp: m.createdTimestamp,
            source: 'cache',
        });
    }
    return hits;
}

async function searchDiscord(
    message: OmitPartialGroupDMChannel<DiscordMessage<boolean>>,
    tokens: string[],
): Promise<RawHit[]> {
    const channel = message.channel as TextChannel | NewsChannel | ThreadChannel;
    if (!('messages' in channel)) return [];
    try {
        const fetched = await channel.messages.fetch({ limit: DISCORD_FALLBACK_LIMIT, before: message.id });
        const hits: RawHit[] = [];
        for (const m of fetched.values()) {
            const content = m.content || '';
            if (!matchesAll(content, tokens)) continue;
            hits.push({
                authorName: m.member?.displayName || m.author.username,
                content,
                createdTimestamp: m.createdTimestamp,
                source: 'discord',
            });
        }
        return hits;
    } catch (error) {
        console.error('[Search] discord fallback fetch failed:', error);
        return [];
    }
}

/**
 * Run the search and return a compact text block to splice back into the
 * conversation. Empty string means "no matches".
 */
export async function runSearch(
    message: OmitPartialGroupDMChannel<DiscordMessage<boolean>>,
    query: string,
): Promise<string> {
    const tokens = tokenizeQuery(query);
    if (tokens.length === 0) return '';

    const channelId = message.channel.id;

    let hits = await searchCache(channelId, tokens);

    // If the cache is sparse, fall back to a bounded Discord fetch.
    if (hits.length < MIN_CACHE_HITS) {
        const apiHits = await searchDiscord(message, tokens);
        // Dedup by (author + content + timestamp) — Discord fetch may return
        // entries already covered by the cache scan.
        const seen = new Set(hits.map((h) => `${h.authorName}|${h.createdTimestamp}|${h.content.slice(0, 32)}`));
        for (const h of apiHits) {
            const key = `${h.authorName}|${h.createdTimestamp}|${h.content.slice(0, 32)}`;
            if (!seen.has(key)) {
                hits.push(h);
                seen.add(key);
            }
        }
    }

    if (hits.length === 0) {
        return `[SEARCH_RESULTS query="${query}"] no matches in this channel`;
    }

    hits.sort((a, b) => b.createdTimestamp - a.createdTimestamp);
    const top = hits.slice(0, MAX_SEARCH_RESULTS);

    const lines = top.map((h) => {
        const when = relativeTime(h.createdTimestamp);
        return `- ${h.authorName} (${when}): ${truncate(h.content.replace(/\n/g, ' '), MAX_RESULT_CONTENT_CHARS)}`;
    });
    const more = hits.length > MAX_SEARCH_RESULTS ? `\n(+${hits.length - MAX_SEARCH_RESULTS} more older matches truncated)` : '';
    return `[SEARCH_RESULTS query="${query}" matches=${hits.length}]\n${lines.join('\n')}${more}`;
}
