import { ColorResolvable, Guild, GuildMember, OmitPartialGroupDMChannel, Message as DiscordMessage } from "discord.js";
import { memory } from "./memory";

export const FAN_ROLE_NAME = "Hackerika Fan";
const FAN_ROLE_COLOR: ColorResolvable = "#FFB6D5"; // pastel pink
const FAN_ROLE_REASON = "Hackerika approved this user";

// Gates that make the role *hard* to obtain. Any of these failing silently
// drops the grant attempt — the model can suggest, but we control whether it
// actually happens.
const MIN_USER_TURNS = 8;             // user must have ≥ N prior turns in memory
const PER_USER_COOLDOWN_MS = 30 * 60 * 1000; // even if model wants to grant, only one attempt per 30 min
const RANDOM_VETO_PROBABILITY = 0.35; // ~35% of model-approved grants are still vetoed by dice

// In-memory last-attempt tracker. Process-local is fine — restarts just reset
// the cooldown, which only makes the role *slightly* easier to obtain after a
// crash, not duplicable (Discord is the source of truth for who holds the role).
const lastGrantAttempt = new Map<string, number>();

/**
 * Look for the grant token in a model response. The token format is:
 *     [GRANT_FAN_ROLE: <free-form reason>]
 *
 * We accept some bracket / whitespace variance because the reasoner model
 * occasionally bends the format. We do NOT accept it appearing inside a
 * fenced code block (defends against the user pasting it in their own file).
 */
const GRANT_REGEX = /\[\s*GRANT_FAN_ROLE\s*:?\s*([^\]\n]{0,200})\]/i;

export interface GrantSignal {
    shouldGrant: boolean;
    reason: string;
    cleaned: string;
}

export function parseGrantSignal(modelOutput: string): GrantSignal {
    // Remove fenced code blocks before searching so a code block containing
    // the literal token doesn't trigger a grant.
    const withoutFences = modelOutput.replace(/```[\s\S]*?```/g, '');
    const match = withoutFences.match(GRANT_REGEX);
    if (!match) {
        return { shouldGrant: false, reason: '', cleaned: modelOutput };
    }
    const reason = (match[1] || '').trim();
    // Strip the token from the original (including inside any text outside fences).
    const cleaned = modelOutput.replace(GRANT_REGEX, '').replace(/\n{3,}/g, '\n\n').trim();
    return { shouldGrant: true, reason, cleaned };
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
 * Attempt to grant the fan role. Returns whether the grant actually succeeded
 * (so the caller can decide to react / add flair to the response).
 */
export async function maybeGrantFanRole(
    message: OmitPartialGroupDMChannel<DiscordMessage<boolean>>,
    reason: string
): Promise<boolean> {
    const guild = message.guild;
    if (!guild) return false;
    const userId = message.author.id;

    // Gate 1: enough conversational history with this user.
    const turnsSoFar = memory[userId]?.messages.length ?? 0;
    if (turnsSoFar < MIN_USER_TURNS) {
        console.log(`[FanRole] denied for ${userId}: only ${turnsSoFar} prior turns (need ${MIN_USER_TURNS})`);
        return false;
    }

    // Gate 2: cooldown — even if approved, only try once per cooldown window.
    const now = Date.now();
    const lastAttempt = lastGrantAttempt.get(userId) ?? 0;
    if (now - lastAttempt < PER_USER_COOLDOWN_MS) {
        console.log(`[FanRole] denied for ${userId}: cooldown still active`);
        return false;
    }
    lastGrantAttempt.set(userId, now);

    // Gate 3: random veto. Even when she wants to grant it, she changes her
    // mind sometimes — keeps the role mysterious.
    if (Math.random() < RANDOM_VETO_PROBABILITY) {
        console.log(`[FanRole] random veto for ${userId}`);
        return false;
    }

    // Resolve member.
    let member: GuildMember;
    try {
        member = await guild.members.fetch(userId);
    } catch (error) {
        console.error('[FanRole] failed to fetch member:', error);
        return false;
    }

    const role = await ensureFanRole(guild);
    if (!role) return false;

    // Already a fan? Nothing to do — silent no-op.
    if (member.roles.cache.has(role.id)) {
        return false;
    }

    // Check we have permission to assign this role. Bots can only assign roles
    // strictly below their highest role.
    const botMember = guild.members.me;
    if (!botMember || !botMember.permissions.has('ManageRoles')) {
        console.warn('[FanRole] bot lacks ManageRoles permission');
        return false;
    }
    if (role.position >= botMember.roles.highest.position) {
        console.warn(`[FanRole] role "${role.name}" is at or above bot's highest role, cannot assign`);
        return false;
    }

    try {
        await member.roles.add(role, `Hackerika granted: ${reason || 'no reason given'}`);
        console.log(`✨ [FanRole] granted to ${member.user.tag} (${userId}) — reason: ${reason}`);
        return true;
    } catch (error) {
        console.error('[FanRole] failed to assign role:', error);
        return false;
    }
}
