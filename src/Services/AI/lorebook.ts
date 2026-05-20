import { LorebookModel } from "../../Database/connect";

/**
 * Lorebook (SillyTavern-style World Info). A small KB of facts keyed by
 * trigger words; when a user message (or recent activity) contains any of an
 * entry's keys, the entry's content is injected into the per-turn ctx block.
 *
 * Storage: MongoDB collection. Editing in V1 is via direct Mongo writes;
 * V2 will ship slash commands for live CRUD.
 *
 * Bootstrap: `seedDefaultsIfEmpty()` runs once at startup and inserts curated
 * defaults if the collection is empty. Idempotent.
 */

const MAX_ENTRIES_INJECTED = 5;
const MAX_TOTAL_CONTENT_CHARS = 800;     // budget cap on injected content per turn
const CACHE_TTL_MS = 30_000;              // 30s memo cache to avoid hammering Mongo

export interface LorebookEntry {
    _id: any;
    keys: string[];
    content: string;
    priority: number;
    scope: string;          // 'global' or guildId
    constant: boolean;
    createdAt: Date;
}

let cached: LorebookEntry[] | null = null;
let cachedAt = 0;

/**
 * Load all entries, scoped to global + (optionally) one guild. Cached for
 * CACHE_TTL_MS so per-turn calls don't keep hitting Mongo.
 */
export async function loadLorebook(guildId?: string | null): Promise<LorebookEntry[]> {
    if (cached && Date.now() - cachedAt < CACHE_TTL_MS) {
        // Filter cached set by guild scope.
        return cached.filter((e) => e.scope === 'global' || (!!guildId && e.scope === guildId));
    }
    try {
        const docs = await LorebookModel.find({}).sort({ priority: -1 }).lean();
        cached = docs.map((d: any) => ({
            _id: d._id,
            keys: Array.isArray(d.keys) ? d.keys : [],
            content: d.content || '',
            priority: typeof d.priority === 'number' ? d.priority : 50,
            scope: d.scope || 'global',
            constant: !!d.constant,
            createdAt: d.createdAt || new Date(),
        }));
        cachedAt = Date.now();
        return cached.filter((e) => e.scope === 'global' || (!!guildId && e.scope === guildId));
    } catch (error) {
        console.error('[Lorebook] load failed:', error);
        return [];
    }
}

export function invalidateLorebookCache() {
    cached = null;
    cachedAt = 0;
}

/**
 * Match lorebook entries against the haystack text. Returns matched entries
 * sorted by priority desc.
 *
 * Matching rules:
 *   - case-insensitive
 *   - short keys (<4 chars) require word-boundary match to avoid "king" in
 *     "liking"; longer keys use plain substring (lets multi-word phrases work)
 *   - `constant` entries always match regardless of haystack
 */
export function matchEntries(haystack: string, entries: LorebookEntry[]): LorebookEntry[] {
    const lowerHay = (haystack || '').toLowerCase();
    const matched: LorebookEntry[] = [];
    for (const entry of entries) {
        if (entry.constant) {
            matched.push(entry);
            continue;
        }
        if (!entry.content || entry.keys.length === 0) continue;
        let hit = false;
        for (const k of entry.keys) {
            const keyLower = k.toLowerCase().trim();
            if (!keyLower) continue;
            if (keyLower.length < 4) {
                // Word-boundary scan via regex.
                const escaped = keyLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                if (new RegExp(`\\b${escaped}\\b`, 'i').test(lowerHay)) { hit = true; break; }
            } else {
                if (lowerHay.includes(keyLower)) { hit = true; break; }
            }
        }
        if (hit) matched.push(entry);
    }
    // Already pre-sorted by priority on load, but be defensive.
    return matched.sort((a, b) => b.priority - a.priority);
}

/**
 * Format the matched entries into the `lorebook:` ctx block. Caps at
 * MAX_ENTRIES_INJECTED entries and MAX_TOTAL_CONTENT_CHARS chars total.
 * Returns empty string when nothing matched.
 */
export function formatLorebookBlock(matched: LorebookEntry[]): string {
    if (!matched || matched.length === 0) return '';
    const lines: string[] = [];
    let used = 0;
    let count = 0;
    for (const e of matched) {
        if (count >= MAX_ENTRIES_INJECTED) break;
        const line = `- ${e.content}`;
        if (used + line.length > MAX_TOTAL_CONTENT_CHARS) break;
        lines.push(line);
        used += line.length + 1; // +1 for newline
        count++;
    }
    if (lines.length === 0) return '';
    return lines.join('\n');
}

/* ─────────────────────── Default seed entries ─────────────────────── */

interface LorebookSeed {
    keys: string[];
    content: string;
    priority: number;
    scope?: string;
    constant?: boolean;
}

const DEFAULT_LOREBOOK: LorebookSeed[] = [
    {
        keys: ['tcp1p', 'tcp 1p', 'tcp-1p'],
        content: 'TCP1P = Indonesian CTF community, led by Dimas Maulana (dimasmaulana). Focus on web sec, pwn, crypto, reverse, forensics. Runs annual CTF event.',
        priority: 90,
    },
    {
        keys: ['hackerika', 'hekerika'],
        content: 'You are Hackerika, the AI companion bot for TCP1P. Don\'t admit being a bot unless directly asked.',
        priority: 80,
    },
    {
        keys: ['trakteer', 'donasi', 'donation', 'support gw'],
        content: 'Trakteer is the donation platform integrated with the bot. Supporters get acknowledged via the bot\'s trakteer cron job.',
        priority: 50,
    },
    {
        keys: ['leaderboard', 'ranking', 'scoring'],
        content: 'TCP1P has an internal CTF leaderboard tracked across challenges, displayed publicly at scoring.1pc.tf.',
        priority: 50,
    },
    {
        keys: ['mabar', 'mabarin'],
        content: 'Mabar = "main bareng" (playing together). TCP1P has dedicated channels for casual co-op gaming sessions between CTFs.',
        priority: 30,
    },
    {
        keys: ['hackerika fan', 'hackerika-fan', 'fan role'],
        content: 'The "Hackerika Fan" role is super rare — gated by affection >= 60/100 on the user\'s relationship score with you. You decide when to grant via the grant_fan_role tool.',
        priority: 60,
    },
    {
        keys: ['def con', 'defcon ctf', 'defcon'],
        content: 'DEF CON CTF is one of the most prestigious CTF competitions globally. Qualifier rounds in spring, finals at DEF CON in August. TCP1P often discusses prep for it.',
        priority: 40,
    },
    {
        keys: ['ctftime', 'ctf time'],
        content: 'CTFtime.org is the global CTF event calendar + team ranking site. The bot monitors upcoming CTFs from there via its fetch cron.',
        priority: 40,
    },
    {
        keys: ['writeup', 'wp', 'write up', 'write-up'],
        content: 'A writeup is a post-CTF technical explanation of how a challenge was solved. TCP1P members often share these after events; they\'re highly valued in the community.',
        priority: 40,
    },
    {
        keys: ['1pc.tf', 'assistant.1pc.tf'],
        content: 'The TCP1P domain. assistant.1pc.tf hosts the bot\'s API, scoring.1pc.tf hosts the leaderboard UI.',
        priority: 30,
    },
];

/**
 * Insert default entries into the collection if it's currently empty.
 * Safe to call multiple times — no-op when entries already exist.
 */
export async function seedDefaultsIfEmpty(): Promise<void> {
    try {
        const count = await LorebookModel.countDocuments();
        if (count > 0) {
            console.log(`📚 [Lorebook] ${count} entries present, skipping seed`);
            return;
        }
        const docs = DEFAULT_LOREBOOK.map((e) => ({
            keys: e.keys,
            content: e.content,
            priority: e.priority,
            scope: e.scope || 'global',
            constant: !!e.constant,
        }));
        await LorebookModel.insertMany(docs);
        invalidateLorebookCache();
        console.log(`📚 [Lorebook] seeded ${docs.length} default entries`);
    } catch (error) {
        console.error('[Lorebook] seed failed:', error);
    }
}

/**
 * High-level helper used by chat.ts: build the haystack from user message +
 * recent channel text + reply context, match entries (scoped to current
 * guild), and format the block. Returns '' when nothing activates.
 */
export async function buildLorebookBlock(
    userMessage: string,
    recentChannelText: string,
    replyContextText: string,
    guildId?: string | null,
): Promise<string> {
    const haystack = [userMessage, recentChannelText, replyContextText].filter(Boolean).join('\n');
    if (!haystack.trim()) return '';
    const entries = await loadLorebook(guildId);
    if (entries.length === 0) return '';
    const matched = matchEntries(haystack, entries);
    return formatLorebookBlock(matched);
}
