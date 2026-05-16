import { Guild, GuildMember } from "discord.js";

const MENTION_REGEX = /<@!?(\d{17,20})>/g;
const MAX_RESOLVED = 10;       // cap on legend entries per turn to bound prompt size
const MAX_ROLES_PER_USER = 3;

export interface ResolvedUser {
    id: string;
    displayName: string;
    username: string;
    roles: string[];
    isBot: boolean;
}

/**
 * Extract unique <@ID> / <@!ID> Discord user mentions across any number of
 * text inputs. Capped at MAX_RESOLVED to bound the resolution cost.
 */
export function extractMentionIds(...texts: (string | null | undefined)[]): string[] {
    const ids = new Set<string>();
    for (const t of texts) {
        if (!t) continue;
        for (const m of t.matchAll(MENTION_REGEX)) {
            ids.add(m[1]);
            if (ids.size >= MAX_RESOLVED) break;
        }
        if (ids.size >= MAX_RESOLVED) break;
    }
    return Array.from(ids);
}

function makeResolved(m: GuildMember): ResolvedUser {
    const roles = m.roles.cache
        .filter((r) => r.name !== '@everyone')
        .map((r) => r.name)
        .slice(0, MAX_ROLES_PER_USER);
    return {
        id: m.id,
        displayName: m.displayName,
        username: m.user.username,
        roles,
        isBot: m.user.bot,
    };
}

/**
 * Resolve a batch of user IDs to displayNames + roles. Uses the discord.js
 * member cache first; falls back to a single bulk fetch for the misses.
 *
 * Failures are silent — unresolved IDs just don't appear in the result map,
 * which the caller can render as "Unknown User".
 */
export async function resolveUsers(guild: Guild | null, ids: string[]): Promise<Map<string, ResolvedUser>> {
    const map = new Map<string, ResolvedUser>();
    if (!guild || ids.length === 0) return map;

    const toFetch: string[] = [];
    for (const id of ids) {
        const cached = guild.members.cache.get(id);
        if (cached) {
            map.set(id, makeResolved(cached));
        } else {
            toFetch.push(id);
        }
    }

    if (toFetch.length > 0) {
        try {
            const fetched = await guild.members.fetch({ user: toFetch });
            for (const member of fetched.values()) {
                map.set(member.id, makeResolved(member));
            }
        } catch (error) {
            console.warn('[Mentions] bulk fetch failed:', error);
            // Fall through with whatever we've got from cache.
        }
    }

    return map;
}

/**
 * Build a compact legend block translating <@ID> → display name + roles.
 * Returns an empty string if no users resolved.
 */
export function buildMentionLegend(resolved: Map<string, ResolvedUser>): string {
    if (resolved.size === 0) return '';
    const lines: string[] = [];
    for (const u of resolved.values()) {
        const rolesPart = u.roles.length > 0 ? ` [${u.roles.join(', ')}]` : '';
        const botMarker = u.isBot ? ' (bot)' : '';
        lines.push(`<@${u.id}> = ${u.displayName} (${u.username})${botMarker}${rolesPart}`);
    }
    return lines.join('\n');
}
