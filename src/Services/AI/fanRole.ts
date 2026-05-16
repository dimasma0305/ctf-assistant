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
    if (!guild) {
        console.log('[FanRole] denied: not in a guild (DM context)');
        return false;
    }
    const userId = message.author.id;
    const isDeveloper = userId === DEVELOPER_USER_ID;

    // Dev bypass: Dimas gets unconditional grants. Hard gates (Discord
    // permissions, already-has-role) still apply below for everyone.
    if (!isDeveloper) {
        // Gate 1: affection threshold. The single softgate — user must have
        // built up enough affection via the profile distillation cycle.
        // No "interaction count" requirement: short genuine interactions can
        // build affection faster than long shallow ones.
        let affection = 0;
        try {
            const profile = await UserProfileModel.findOne({ userId }).select({ affection: 1 }).lean();
            affection = (profile as any)?.affection ?? 0;
        } catch (error) {
            console.error('[FanRole] failed to read profile:', error);
        }
        if (affection < AFFECTION_THRESHOLD) {
            console.log(`[FanRole] denied for ${userId}: affection ${affection}/100 (need ${AFFECTION_THRESHOLD})`);
            return false;
        }

        // Gate 2: short cooldown — only guards against tight retry loops if
        // the model spam-emits the token over consecutive turns.
        const now = Date.now();
        const lastAttempt = lastGrantAttempt.get(userId) ?? 0;
        if (now - lastAttempt < PER_USER_COOLDOWN_MS) {
            console.log(`[FanRole] denied for ${userId}: cooldown active (${Math.ceil((PER_USER_COOLDOWN_MS - (now - lastAttempt)) / 60000)}m left)`);
            return false;
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
        return false;
    }

    const role = await ensureFanRole(guild);
    if (!role) {
        console.warn('[FanRole] role creation failed');
        return false;
    }

    if (member.roles.cache.has(role.id)) {
        console.log(`[FanRole] ${userId} already has role, no-op`);
        return false;
    }

    const botMember = guild.members.me;
    if (!botMember || !botMember.permissions.has('ManageRoles')) {
        console.warn('[FanRole] bot lacks ManageRoles permission');
        return false;
    }
    if (role.position >= botMember.roles.highest.position) {
        console.warn(`[FanRole] role "${role.name}" position=${role.position} is at or above bot's highest role position=${botMember.roles.highest.position}, cannot assign — move bot role above ${role.name} in server settings`);
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
