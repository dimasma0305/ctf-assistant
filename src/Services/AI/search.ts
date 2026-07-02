import { OmitPartialGroupDMChannel, Message as DiscordMessage, TextChannel, NewsChannel, ThreadChannel } from "discord.js";
import { MessageCacheModel, IndexedMessageModel } from "../../Database/connect";
import { embedViaWorker, cosineSimilarity, combinedRecallScore } from "./embeddings";
import { neutralizeControlTokens } from "./context";

const MAX_SEARCH_RESULTS = 8;             // hard cap on result rows fed back to the model
const MAX_RESULT_CONTENT_CHARS = 700;     // per-message truncation for EXPLICIT retrieval (search/recall).
                                          // Raised from 220: pasted payloads/CVEs/writeups — the exact
                                          // content most worth recalling in a security community — were
                                          // being cut mid-string even when the model explicitly asked for
                                          // them. Passive `recent:` context stays cheaper (context.ts).
const INDEX_QUERY_LIMIT = 50;             // how many indexed matches to evaluate before truncating
const DISCORD_FALLBACK_LIMIT = 100;       // how many recent messages to pull when index is sparse
const MIN_INDEX_HITS = 3;                 // if index returns fewer matches than this, also fetch from Discord API
const RECALL_CANDIDATE_LIMIT = 500;       // how many vectorized candidates to score for semantic recall
const RECALL_MIN_SIMILARITY = 0.35;       // floor for "good enough" cosine similarity

interface RawHit {
    authorId: string;
    authorName: string;
    content: string;
    createdTimestamp: number;
    source: 'cache' | 'discord' | 'index';
    /** Importance score from the LLM-side classifier (1-10, default 5). */
    importance?: number;
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
                importance: typeof d.importance === 'number' ? d.importance : 5,
            });
        }
        return hits;
    } catch (error) {
        console.error('[Search] index query failed:', error);
        return [];
    }
}

async function searchCache(channelId: string, parsed: ParsedQuery): Promise<RawHit[]> {
    try {
        const cache = await MessageCacheModel.findOne({ channelId }).maxTimeMS(15_000).lean();
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
    } catch (error) {
        // Degrade to [] like searchIndex/searchDiscord so a transient cache blip
        // doesn't unwind a search that already collected index hits.
        console.error('[Search] cache tier failed:', error);
        return [];
    }
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

export interface SearchToolMatch {
    authorId: string;
    authorName: string;
    content: string;
    relativeTime: string;    // e.g. "5m ago", "2d ago"
    source: 'index' | 'cache' | 'discord';
}

export interface SearchToolResult {
    /** Uniform success flag so the model never mistakes a no-filter/no-result
     *  envelope for a hit (matches recall_memory + the {ok} tool convention). */
    ok: boolean;
    matches: SearchToolMatch[];
    totalMatches: number;
    filter: {
        authorIds: string[];
        terms: string[];
    };
    /** Human-readable explanation when no useful filter was provided. */
    note?: string;
}

/**
 * Native function-calling entry point for the `search_messages` tool.
 * Returns a structured object (serialized to JSON by the dispatcher and fed
 * back to the model as a `role:'tool'` message).
 *
 * Reuses every internal helper that runSearch used to use — only the output
 * shape changed.
 */
export async function searchMessagesForTool(
    message: OmitPartialGroupDMChannel<DiscordMessage<boolean>>,
    query: string,
    authorId?: string,
): Promise<SearchToolResult> {
    // Build the parsed-query directly: caller passes structured args, no
    // need to round-trip through the old <@id> string-injection trick.
    const parsed: ParsedQuery = parseQuery(query || '');
    if (authorId && /^\d{17,20}$/.test(authorId) && !parsed.authorIds.includes(authorId)) {
        parsed.authorIds.push(authorId);
    }

    const filter = { authorIds: [...parsed.authorIds], terms: [...parsed.tokens] };

    if (parsed.authorIds.length === 0 && parsed.tokens.length === 0) {
        return {
            ok: false,
            matches: [],
            totalMatches: 0,
            filter,
            note: 'no_filter: either query keywords or authorId must be provided',
        };
    }

    const guildId = message.guildId;
    const channelId = message.channel.id;

    const indexHits = await searchIndex(guildId, channelId, parsed);
    const cacheHits = await searchCache(channelId, parsed);
    const needDiscord = indexHits.length < MIN_INDEX_HITS || parsed.authorIds.length > 0;
    const discordHits = needDiscord ? await searchDiscord(message, parsed) : [];

    const seen = new Set<string>();
    const all: RawHit[] = [];
    const merge = (src: RawHit[]) => {
        for (const h of src) {
            const key = `${h.authorId}|${h.createdTimestamp}|${h.content.slice(0, 32)}`;
            if (seen.has(key)) continue;
            seen.add(key);
            all.push(h);
        }
    };
    merge(indexHits);
    merge(cacheHits);
    merge(discordHits);

    // Two-way weighted scoring: recency (70%) + importance (30%). Replaces
    // the previous "newest-first only" approach so a recent "lol" doesn't
    // outrank a 2-day-old technical insight when both match the query.
    const now = Date.now();
    all.sort((a, b) => {
        const ageA = (now - a.createdTimestamp) / (1000 * 60 * 60); // hours
        const ageB = (now - b.createdTimestamp) / (1000 * 60 * 60);
        const recA = Math.exp(-Math.log(2) * ageA / 24);             // 24h half-life
        const recB = Math.exp(-Math.log(2) * ageB / 24);
        const impA = (a.importance || 5) / 10;
        const impB = (b.importance || 5) / 10;
        const scoreA = 0.7 * recA + 0.3 * impA;
        const scoreB = 0.7 * recB + 0.3 * impB;
        return scoreB - scoreA;
    });
    const top = all.slice(0, MAX_SEARCH_RESULTS).map<SearchToolMatch>((h) => ({
        authorId: h.authorId,
        authorName: h.authorName,
        // Neutralize forged control tokens — stored second-order injection: an
        // attacker plants a creator-spoof block in a normal message, then the
        // model recalls it verbatim via this tool (2026-06-09 audit fix).
        content: truncate(neutralizeControlTokens(h.content).replace(/\n/g, ' '), MAX_RESULT_CONTENT_CHARS),
        relativeTime: relativeTime(h.createdTimestamp),
        source: h.source,
    }));

    return {
        ok: true,
        matches: top,
        totalMatches: all.length,
        filter,
    };
}

/* ─────────────────────── Semantic recall (recall_memory tool) ─────────────────────── */

export interface RecallMemoryArgs {
    query?: string;
    limit?: number;
    authorId?: string;
}

export interface RecallToolMatch extends SearchToolMatch {
    similarity: number;     // cosine similarity 0..1
    importance: number;     // 1-10
}

export interface RecallToolResult {
    ok: boolean;
    error?: 'missing_query' | 'embed_failed' | 'no_results';
    matches?: RecallToolMatch[];
    totalCandidates?: number;
    filter?: { authorId?: string; channelId: string; guildId: string | null };
}

/**
 * Semantic recall over indexed messages. Embeds the query via the worker,
 * pulls ≤500 recent candidates from the same channel (optionally filtered
 * by author), computes cosine similarity in Node, ranks by the combined
 * recency + importance + similarity score from embeddings.ts, returns top-N.
 *
 * Complements `search_messages` (keyword) for paraphrased queries where the
 * exact words don't appear ("cookie security" finding prior "session token"
 * discussions, etc.).
 */
export async function recallMemoryForTool(
    message: OmitPartialGroupDMChannel<DiscordMessage<boolean>>,
    args: RecallMemoryArgs,
): Promise<RecallToolResult> {
    const query = (args?.query || '').trim();
    if (!query) return { ok: false, error: 'missing_query' };
    const limit = Math.max(1, Math.min(MAX_SEARCH_RESULTS, Number(args?.limit) || 5));
    const authorId = args?.authorId && /^\d{17,20}$/.test(args.authorId) ? args.authorId : undefined;

    const guildId = message.guildId;
    const channelId = message.channel.id;

    // 1. Embed the query.
    const queryVector = await embedViaWorker(query);
    if (!queryVector) {
        return { ok: false, error: 'embed_failed' };
    }

    // 2. Pull candidates (must have embedding stored).
    const filter: any = {
        guildId,
        channelId,
        embedding: { $exists: true, $ne: null },
    };
    if (authorId) filter.authorId = authorId;

    let docs: any[] = [];
    try {
        docs = await IndexedMessageModel.find(filter)
            .sort({ createdAt: -1 })
            .limit(RECALL_CANDIDATE_LIMIT)
            .select({
                authorId: 1, authorDisplayName: 1, authorUsername: 1,
                content: 1, createdAt: 1, embedding: 1, importance: 1, _id: 0,
            })
            .lean();
    } catch (error) {
        console.error('[Recall] candidate fetch failed:', error);
        return { ok: false, error: 'no_results' };
    }
    if (docs.length === 0) return { ok: true, matches: [], totalCandidates: 0, filter: { authorId, channelId, guildId } };

    // 3. Score each candidate.
    const now = Date.now();
    const scored = docs.map((d: any) => {
        const emb: number[] = Array.isArray(d.embedding) ? d.embedding : [];
        const sim = cosineSimilarity(queryVector, emb);
        const ageHours = (now - new Date(d.createdAt).getTime()) / (1000 * 60 * 60);
        const importance = typeof d.importance === 'number' ? d.importance : 5;
        const score = combinedRecallScore(sim, importance, ageHours, 24);
        return {
            authorId: d.authorId,
            authorName: d.authorDisplayName || d.authorUsername || 'unknown',
            // Neutralize forged control tokens (stored injection — see above).
            content: truncate(neutralizeControlTokens(String(d.content || '')).replace(/\n/g, ' '), MAX_RESULT_CONTENT_CHARS),
            createdTimestamp: new Date(d.createdAt).getTime(),
            similarity: sim,
            importance,
            score,
        };
    });

    // 4. Filter by minimum semantic similarity (rejects pure-recency noise)
    //    and take top-N by combined score.
    const filtered = scored.filter((s) => s.similarity >= RECALL_MIN_SIMILARITY);
    filtered.sort((a, b) => b.score - a.score);
    const top = filtered.slice(0, limit).map<RecallToolMatch>((s) => ({
        authorId: s.authorId,
        authorName: s.authorName,
        content: s.content,
        relativeTime: relativeTime(s.createdTimestamp),
        source: 'index',
        similarity: Math.round(s.similarity * 1000) / 1000,
        importance: s.importance,
    }));

    console.log(
        `🧠 [Recall] query="${truncate(query, 60)}" → ` +
        `candidates=${docs.length} above-threshold=${filtered.length} returned=${top.length}` +
        (authorId ? ` author=<@${authorId}>` : ''),
    );

    return {
        ok: true,
        matches: top,
        totalCandidates: docs.length,
        filter: { authorId, channelId, guildId },
    };
}
