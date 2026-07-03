import cron from "node-cron";
import { Guild, GuildMember } from "discord.js";
import { Event } from "../../Handlers/eventHandler";
import { MyClient } from "../../Model/client";
import { solveModel, UserModel } from "../../Database/connect";
import { createRoleIfNotExist } from "../../Commands/Public/Ctftime/utils/event";
import { isNoDbMode } from "../../utils/env";

/**
 * COSMETIC achievement role for active players: awarded to every player who has
 * submitted solves (via the bot's /solve flow — the only way Solve docs are
 * created) across at least GAS_MABAR_MIN_CTFS DISTINCT CTFs.
 *
 * ⚠️ IMPORTANT — the role is deliberately NAMED "Gas Mabar Player", NOT "Gas
 * Mabar". "Gas Mabar" is an AUTHORIZATION role: it's listed in `allowedRoles`
 * for /solve init, /ctftime schedule, and /notify list (matched by role NAME in
 * SlashCommands.ts). /solve init was specifically restricted to organizers by
 * the 2026-06-09 security audit (ungated it enabled SSRF + mass thread-spam), so
 * auto-granting "Gas Mabar" to every ≥3-CTF player would silently re-open that
 * gate — and monotonic qualification + this 6h re-grant would make it
 * un-revokable. This cosmetic role (no Discord permissions, not in any
 * allowedRoles) recognises active players without touching command access. If
 * organiser powers for active players are actually intended, that's an explicit
 * access-control decision — change ROLE_NAME back to "Gas Mabar" deliberately,
 * and add a revocation/exclusion path.
 */

const ROLE_NAME = "Gas Mabar Player";
const ROLE_COLOR = "#43B581"; // friendly green
const GAS_MABAR_MIN_CTFS = 3;
const GRANT_CRON = "0 */6 * * *"; // every 6 hours
const BACKFILL_DELAY_MS = 60_000; // let the member cache warm after ready before the first run
const FETCH_CONCURRENCY = 8;
const GRANT_CONCURRENCY = 5;

async function runWithConcurrency<T>(items: T[], limit: number, task: (item: T) => Promise<void>): Promise<void> {
    let i = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (i < items.length) {
            const idx = i++;
            await task(items[idx]);
        }
    });
    await Promise.all(workers);
}

/**
 * Discord IDs of players who solved ≥1 challenge in ≥ GAS_MABAR_MIN_CTFS distinct
 * CTFs. Pipeline: (user, ctf_id) distinct pairs → per-user distinct-CTF count →
 * threshold → map User ObjectId to discord_id.
 */
async function qualifyingDiscordIds(): Promise<string[]> {
    const rows: Array<{ _id: any }> = await solveModel.aggregate([
        { $unwind: "$users" },
        { $group: { _id: { user: "$users", ctf: "$ctf_id" } } },       // distinct (user, ctf)
        { $group: { _id: "$_id.user", ctfs: { $sum: 1 } } },           // distinct-CTF count per user
        { $match: { ctfs: { $gte: GAS_MABAR_MIN_CTFS } } },
    ]).option({ maxTimeMS: 30_000 }).allowDiskUse(true);

    const userIds = rows.map((r) => r._id).filter(Boolean);
    if (!userIds.length) return [];

    const users = await UserModel.find({ _id: { $in: userIds } }).select({ discord_id: 1 }).lean();
    return users
        .map((u: any) => u.discord_id)
        .filter((id: any): id is string => typeof id === "string" && id.length > 0);
}

async function grantRoleInGuild(guild: Guild, discordIds: string[]): Promise<number> {
    // Which qualifying players are actually in THIS guild? (Fetch bounded; misses tolerated.)
    const present: GuildMember[] = [];
    await runWithConcurrency(discordIds, FETCH_CONCURRENCY, async (id) => {
        const m = await guild.members.fetch(id).catch(() => null);
        if (m) present.push(m);
    });
    if (!present.length) return 0;

    // Check ManageRoles BEFORE attempting to create the role (roles.create needs it).
    const me = guild.members.me;
    if (!me || !me.permissions.has("ManageRoles")) {
        console.warn(`[GasMabar] cannot manage roles in ${guild.name} — bot lacks ManageRoles`);
        return 0;
    }
    const role = await createRoleIfNotExist({ name: ROLE_NAME, guild, color: ROLE_COLOR });
    if (role.position >= me.roles.highest.position) {
        console.warn(`[GasMabar] "${ROLE_NAME}" in ${guild.name} is at/above the bot's highest role — cannot assign`);
        return 0;
    }

    let granted = 0;
    await runWithConcurrency(present, GRANT_CONCURRENCY, async (m) => {
        if (m.roles.cache.has(role.id)) return; // idempotent
        try { await m.roles.add(role, `Solved challenges across ≥${GAS_MABAR_MIN_CTFS} CTFs via the bot`); granted++; }
        catch (error) { console.error(`[GasMabar] failed to grant to ${m.user.tag} (${m.id}):`, error); }
    });
    return granted;
}

let running = false;
async function runGrant(client: MyClient) {
    if (isNoDbMode()) return;
    if (running) { console.warn("[GasMabar] previous run still in progress — skipping"); return; }
    running = true;
    try {
        const ids = await qualifyingDiscordIds();
        if (!ids.length) { console.log("[GasMabar] no players qualify yet (need ≥3 distinct CTFs)"); return; }
        let total = 0;
        for (const guild of client.guilds.cache.values()) {
            total += await grantRoleInGuild(guild, ids).catch((e) => { console.error(`[GasMabar] guild ${guild.id} failed:`, e); return 0; });
        }
        console.log(`[GasMabar] ${ids.length} player(s) qualify; granted "${ROLE_NAME}" to ${total} new member(s)`);
    } catch (error) {
        console.error("[GasMabar] run failed:", error);
    } finally {
        running = false;
    }
}

let cronInit = false;
export const event: Event = {
    name: "ready",
    once: true,
    async execute(client: MyClient) {
        if (cronInit) return;
        cronInit = true;
        setTimeout(() => { void runGrant(client); }, BACKFILL_DELAY_MS); // initial backfill
        cron.schedule(GRANT_CRON, () => { void runGrant(client); }, { timezone: "Asia/Jakarta" });
        console.log(`✅ Gas Mabar role cron loaded (≥${GAS_MABAR_MIN_CTFS} CTFs solved via bot)`);
    },
};
