import { OmitPartialGroupDMChannel, Message as DiscordMessage, TextChannel, NewsChannel, ThreadChannel } from "discord.js";
import { MessageCacheModel, IndexedMessageModel } from "../../Database/connect";

const MAX_SEARCH_RESULTS = 8;             // hard cap on result rows fed back to the model
const MAX_RESULT_CONTENT_CHARS = 220;     // per-message truncation in the results block
const INDEX_QUERY_LIMIT = 50;             // how many indexed matches to evaluate before truncating
const DISCORD_FALLBACK_LIMIT = 100;       // how many recent messages to pull when index is sparse
const MIN_INDEX_HITS = 3;                 // if index returns fewer matches than this, also fetch from Discord API

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
    authorId: string;
    authorName: string;
    content: string;
    createdTimestamp: number;
    source: 'cache' | 'discord' | 'index';
}

interface ParsedQuery {
    authorIds: string[];   // empty = no author filter
    tokens: string[];      // content tokens (substring AND match), empty = no content filter
}

// Match Discord mention shapes: <@123>, <@!123>, <@&123> (roles, ignored here).
const USER_MENTION_REGEX = /<@!?(\d{17,20})>/g;

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
 * Parse `[SEARCH: …]` payload into:
 *   - authorIds: any <@USERID> mentions found → treated as "messages BY this user"
 *   - tokens: remaining text, split into case-insensitive substring tokens.
 *     Quoted phrases are kept intact: `[SEARCH: "race condition" exploit]`.
 *
 * Either filter is optional; both being empty means the search has no signal
 * and we return zero hits (handled in runSearch).
 */
function parseQuery(query: string): ParsedQuery {
    const authorIds: string[] = [];
    const withoutMentions = query.replace(USER_MENTION_REGEX, (_full, id) => {
        if (!authorIds.includes(id)) authorIds.push(id);
        return ' ';
    });

    const tokens: string[] = [];
    const quotedRegex = /"([^"]+)"|(\S+)/g;
    let m: RegExpExecArray | null;
    while ((m = quotedRegex.exec(withoutMentions)) !== null) {
        const tok = (m[1] || m[2] || '').toLowerCase();
        if (tok.length >= 2) tokens.push(tok);
    }
    return { authorIds, tokens };
}

function matchesContent(content: string, tokens: string[]): boolean {
    if (tokens.length === 0) return true;  // no content filter = pass
    const lower = content.toLowerCase();
    return tokens.every((t) => lower.includes(t));
}

function matchesAuthor(authorId: string, authorIds: string[]): boolean {
    if (authorIds.length === 0) return true;  // no author filter = pass
    return authorIds.includes(authorId);
}

/**
 * Search the persistent MongoDB index. This is the deepest tier — covers the
 * full 90-day TTL window for this channel, not just the last 100 messages.
 *
 * Strategy:
 *   - Build a filter: channelId always, authorId if set, content $text if any tokens
 *   - Sort by createdAt desc (newest first)
 *   - Cap to INDEX_QUERY_LIMIT documents
 *   - Application-level token re-check (in case $text matched on stemming
 *     but our substring contract is stricter)
 */
async function searchIndex(
    guildId: string | null,
    channelId: string,
    parsed: ParsedQuery,
): Promise<RawHit[]> {
    if (!guildId) return [];
    const filter: any = { guildId, channelId };
    if (parsed.authorIds.length > 0) {
        filter.authorId = parsed.authorIds.length === 1 ? parsed.authorIds[0] : { $in: parsed.authorIds };
    }
    if (parsed.tokens.length > 0) {
        // Mongo $text takes a space-separated string and uses an OR-like match;
        // we still enforce strict AND substring at application level below.
        filter.$text = { $search: parsed.tokens.join(' ') };
    }

    try {
        const docs = await IndexedMessageModel.find(filter)
            .sort({ createdAt: -1 })
            .limit(INDEX_QUERY_LIMIT)
            .lean();
        const hits: RawHit[] = [];
        for (const d of docs as any[]) {
            const content = d.content || '';
            if (!matchesContent(content, parsed.tokens)) continue;
            hits.push({
                authorId: d.authorId,
                authorName: d.authorDisplayName || d.authorUsername || 'unknown',
                content,
                createdTimestamp: new Date(d.createdAt).getTime(),
                source: 'index',
            });
        }
        return hits;
    } catch (error) {
        console.error('[Search] index query failed:', error);
        return [];
    }
}

async function searchCache(channelId: string, parsed: ParsedQuery): Promise<RawHit[]> {
    const cache = await MessageCacheModel.findOne({ channelId }).lean();
    if (!cache || !cache.messages) return [];
    const messages = cache.messages as any[];
    const hits: RawHit[] = [];
    for (const m of messages) {
        const authorId = m.author?.id || '';
        if (!matchesAuthor(authorId, parsed.authorIds)) continue;
        const content = m.content || '';
        if (!matchesContent(content, parsed.tokens)) continue;
        hits.push({
            authorId,
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
    parsed: ParsedQuery,
): Promise<RawHit[]> {
    const channel = message.channel as TextChannel | NewsChannel | ThreadChannel;
    if (!('messages' in channel)) return [];
    try {
        const fetched = await channel.messages.fetch({ limit: DISCORD_FALLBACK_LIMIT, before: message.id });
        const hits: RawHit[] = [];
        for (const m of fetched.values()) {
            const authorId = m.author.id;
            if (!matchesAuthor(authorId, parsed.authorIds)) continue;
            const content = m.content || '';
            if (!matchesContent(content, parsed.tokens)) continue;
            hits.push({
                authorId,
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
    const parsed = parseQuery(query);
    // Need at least one filter to be meaningful — otherwise we'd return
    // every message in the index.
    if (parsed.authorIds.length === 0 && parsed.tokens.length === 0) return '';

    const guildId = message.guildId;
    const channelId = message.channel.id;

    // Tier 1: persistent MongoDB index (covers the full 90-day window for
    // every channel the bot has been receiving messages in).
    const indexHits = await searchIndex(guildId, channelId, parsed);
    const hits: RawHit[] = [...indexHits];

    // Tier 2: short-lived per-channel cache. Covers very recent messages
    // that may not yet have been flushed to the index.
    const cacheHits = await searchCache(channelId, parsed);

    // Tier 3: live Discord fetch — only when index hits are sparse. Catches
    // messages predating the index or any gaps in indexing (e.g. bot was
    // offline). Author-scoped searches always pay for this because the
    // index might miss messages from before the bot joined / restarted.
    const needDiscord = indexHits.length < MIN_INDEX_HITS || parsed.authorIds.length > 0;
    const discordHits = needDiscord ? await searchDiscord(message, parsed) : [];

    // Merge with dedup by (authorId + timestamp + content-prefix).
    const seen = new Set<string>();
    const merge = (src: RawHit[]) => {
        for (const h of src) {
            const key = `${h.authorId}|${h.createdTimestamp}|${h.content.slice(0, 32)}`;
            if (seen.has(key)) continue;
            seen.add(key);
            hits.push(h);
        }
    };
    // index already in hits — record their keys, then merge the others.
    for (const h of indexHits) {
        seen.add(`${h.authorId}|${h.createdTimestamp}|${h.content.slice(0, 32)}`);
    }
    merge(cacheHits);
    merge(discordHits);

    // Human-readable description of which filters were active.
    const filterDesc = [
        parsed.authorIds.length > 0 ? `from=${parsed.authorIds.map((id) => `<@${id}>`).join(',')}` : null,
        parsed.tokens.length > 0 ? `terms="${parsed.tokens.join(' ')}"` : null,
    ].filter(Boolean).join(' ');

    if (hits.length === 0) {
        return `[SEARCH_RESULTS ${filterDesc}] no matches in this channel`;
    }

    hits.sort((a, b) => b.createdTimestamp - a.createdTimestamp);
    const top = hits.slice(0, MAX_SEARCH_RESULTS);

    const lines = top.map((h) => {
        const when = relativeTime(h.createdTimestamp);
        return `- ${h.authorName} (${when}): ${truncate(h.content.replace(/\n/g, ' '), MAX_RESULT_CONTENT_CHARS)}`;
    });
    const more = hits.length > MAX_SEARCH_RESULTS ? `\n(+${hits.length - MAX_SEARCH_RESULTS} more older matches truncated)` : '';
    return `[SEARCH_RESULTS ${filterDesc} matches=${hits.length}]\n${lines.join('\n')}${more}`;
}
