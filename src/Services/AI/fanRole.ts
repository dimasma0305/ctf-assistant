import { ColorResolvable, Guild, GuildMember, OmitPartialGroupDMChannel, Message as DiscordMessage } from "discord.js";
import { UserProfileModel } from "../../Database/connect";

export const FAN_ROLE_NAME = "Hackerika Fan";
const FAN_ROLE_COLOR: ColorResolvable = "#FFB6D5"; // pastel pink
const FAN_ROLE_REASON = "Hackerika approved this user";

// Developer/creator gets a bypass — the DIMAS section in the system prompt
// says full obedience, this enforces it at the code level too.
const DEVELOPER_USER_ID = '663394727688798231';

// Affection-based gating. User must build up an affection score with
// Hackerika (via the profile distillation pass) before becoming eligible.
// This makes the role feel earned through a real relationship arc rather
// than gamed via raw interaction count.
const AFFECTION_THRESHOLD = 60;       // 0-100; 60 = "close / fan-worthy" tier
const PER_USER_COOLDOWN_MS = 5 * 60 * 1000; // 5 min — guards against tight retry loops

// In-memory last-attempt tracker. Process-local is fine — restarts just reset
// the cooldown, which only makes the role *slightly* easier to obtain after a
// crash, not duplicable (Discord is the source of truth for who holds the role).
const lastGrantAttempt = new Map<string, number>();

/** Tagged error codes returned by grantFanRoleForTool. The model sees these
 *  in the tool result JSON and can react appropriately. */
export type GrantErrorCode =
    | 'not_in_guild'
    | 'affection_too_low'
    | 'cooldown_active'
    | 'member_fetch_failed'
    | 'role_creation_failed'
    | 'already_has_role'
    | 'permission_denied'
    | 'role_position_error'
    | 'role_assign_failed';

export interface GrantToolResult {
    granted: boolean;
    error?: GrantErrorCode;
    /** Optional human-readable detail (e.g. current affection score). */
    detail?: string;
}

export async function ensureFanRole(guild: Guild) {
    let role = guild.roles.cache.find((r) => r.name === FAN_ROLE_NAME);
    if (role) return role;

    try {
        role = await guild.roles.create({
            name: FAN_ROLE_NAME,
            color: FAN_ROLE_COLOR,
            hoist: false,
            mentionable: false,
            permissions: [],
            reason: FAN_ROLE_REASON,
        });
    } catch (error) {
        console.error('Failed to create Hackerika Fan role:', error);
        return null;
    }
    return role;
}

/**
 * Native function-calling entry point for `grant_fan_role`. The model asks,
 * the gate logic decides, the result tells the model exactly what happened
 * so it can react in the same turn ("yay" vs "wkwk masih kepagian").
 */
export async function grantFanRoleForTool(
    message: OmitPartialGroupDMChannel<DiscordMessage<boolean>>,
    reason: string,
): Promise<GrantToolResult> {
    const guild = message.guild;
    if (!guild) {
        console.log('[FanRole] denied: not in a guild (DM context)');
        return { granted: false, error: 'not_in_guild' };
    }
    const userId = message.author.id;
    const isDeveloper = userId === DEVELOPER_USER_ID;

    if (!isDeveloper) {
        // Gate 1: affection threshold.
        let affection = 0;
        try {
            const profile = await UserProfileModel.findOne({ userId }).select({ affection: 1 }).lean();
            affection = (profile as any)?.affection ?? 0;
        } catch (error) {
            console.error('[FanRole] failed to read profile:', error);
        }
        if (affection < AFFECTION_THRESHOLD) {
            console.log(`[FanRole] denied for ${userId}: affection ${affection}/100 (need ${AFFECTION_THRESHOLD})`);
            return {
                granted: false,
                error: 'affection_too_low',
                detail: `current=${affection}/100 threshold=${AFFECTION_THRESHOLD}`,
            };
        }

        // Gate 2: short cooldown — only guards against tight retry loops if
        // the model spam-calls the tool over consecutive turns.
        const now = Date.now();
        const lastAttempt = lastGrantAttempt.get(userId) ?? 0;
        if (now - lastAttempt < PER_USER_COOLDOWN_MS) {
            const minsLeft = Math.ceil((PER_USER_COOLDOWN_MS - (now - lastAttempt)) / 60000);
            console.log(`[FanRole] denied for ${userId}: cooldown active (${minsLeft}m left)`);
            return { granted: false, error: 'cooldown_active', detail: `${minsLeft}m left` };
        }
        lastGrantAttempt.set(userId, now);

        console.log(`[FanRole] gate passed for ${userId}: affection ${affection}/100`);
    } else {
        console.log(`[FanRole] dev bypass active for ${userId} (Dimas)`);
    }

    // Resolve member.
    let member: GuildMember;
    try {
        member = await guild.members.fetch(userId);
    } catch (error) {
        console.error('[FanRole] failed to fetch member:', error);
        return { granted: false, error: 'member_fetch_failed' };
    }

    const role = await ensureFanRole(guild);
    if (!role) {
        console.warn('[FanRole] role creation failed');
        return { granted: false, error: 'role_creation_failed' };
    }

    if (member.roles.cache.has(role.id)) {
        console.log(`[FanRole] ${userId} already has role, no-op`);
        return { granted: false, error: 'already_has_role' };
    }

    const botMember = guild.members.me;
    if (!botMember || !botMember.permissions.has('ManageRoles')) {
        console.warn('[FanRole] bot lacks ManageRoles permission');
        return { granted: false, error: 'permission_denied' };
    }
    if (role.position >= botMember.roles.highest.position) {
        console.warn(`[FanRole] role "${role.name}" position=${role.position} is at or above bot's highest role position=${botMember.roles.highest.position}, cannot assign — move bot role above ${role.name} in server settings`);
        return { granted: false, error: 'role_position_error' };
    }

    try {
        await member.roles.add(role, `Hackerika granted: ${reason || 'no reason given'}`);
        console.log(`✨ [FanRole] granted to ${member.user.tag} (${userId}) — reason: ${reason}`);
        return { granted: true };
    } catch (error) {
        console.error('[FanRole] failed to assign role:', error);
        return { granted: false, error: 'role_assign_failed' };
    }
}
