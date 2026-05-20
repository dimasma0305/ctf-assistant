import { Message as DiscordMessage, TextChannel, NewsChannel, ThreadChannel } from "discord.js";
import { SharingChannelConfigModel } from "../../Database/connect";
import { MyClient } from "../../Model/client";

/**
 * Sharing-channel cleaner.
 *
 * A "sharing channel" is configured via `SharingChannelConfigModel` and meant
 * to hold resources (links, images, files, writeups). The cleaner sweeps
 * every 30 min and prunes messages that don't qualify as sharing — keeping
 * the channel as a clean log over time.
 *
 * **What counts as a "sharing message"** (any one of these → KEEP):
 *   - Has at least one attachment (image, file, video, etc.)
 *   - Has at least one embed (auto-rendered link preview, quoted msg, etc.)
 *   - Content contains a URL pattern
 *   - Pinned message
 *   - Content length > 500 chars (treat long text as a writeup)
 *   - Author ID in `exemptUserIds` (admins making text announcements)
 *   - Author has a role in `exemptRoleIds`
 *   - Reply to a sharing-qualifying parent (preserves discussion thread)
 *   - Message is younger than `gracePeriodMin` (default 30 min)
 *
 * Everything else → DELETE. Bot messages (including Hackerika's own replies)
 * have NO special exemption — they pass the same content rules. A bot
 * announcement with an embed/URL still qualifies; a chat reply from her
 * gets pruned along with regular chat.
 *
 * Discord constraints respected:
 *   - Bulk delete API only works on messages <14 days old. Older deletions
 *     fall back to per-message DELETE (slower, rate-limited). We cap the
 *     scan at <14 days so this never fires.
 *   - Scan depth = last 100 messages per channel per pass. The 30-min cadence
 *     covers normal traffic comfortably.
 */

const SCAN_LIMIT = 100;
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;     // Discord's bulk-delete window
const URL_REGEX = /(?:https?:\/\/|www\.)\S+/i;
const LONG_TEXT_THRESHOLD = 500;

interface CleanerConfig {
    guildId: string;
    channelId: string;
    gracePeriodMin: number;
    exemptUserIds: string[];
    exemptRoleIds: string[];
}

/**
 * Decide whether a message qualifies as "sharing" content. Receives the full
 * Discord message + the channel's config. Returns true → keep, false → delete.
 *
 * `referencedMessageQualifies` is optional and used for the reply-to-sharing
 * rule. Callers compute it by looking up the parent in the same scan batch.
 */
export function isSharingMessage(
    message: DiscordMessage,
    config: CleanerConfig,
    referencedMessageQualifies?: boolean,
): { keep: boolean; reason: string } {
    // Pinned messages are always kept — they're admin-decided important.
    if (message.pinned) return { keep: true, reason: 'pinned' };

    // Author exemption.
    if (config.exemptUserIds.includes(message.author.id)) {
        return { keep: true, reason: 'exempt_user' };
    }
    if (message.member && config.exemptRoleIds.length > 0) {
        for (const roleId of message.member.roles.cache.keys()) {
            if (config.exemptRoleIds.includes(roleId)) {
                return { keep: true, reason: 'exempt_role' };
            }
        }
    }

    // Grace period: message younger than gracePeriodMin is exempt.
    const ageMs = Date.now() - message.createdTimestamp;
    const graceMs = config.gracePeriodMin * 60 * 1000;
    if (ageMs < graceMs) return { keep: true, reason: 'within_grace' };

    // Attachments / embeds / URL / long text → sharing.
    if (message.attachments.size > 0) return { keep: true, reason: 'attachment' };
    if (message.embeds.length > 0) return { keep: true, reason: 'embed' };

    const content = message.content || '';
    if (URL_REGEX.test(content)) return { keep: true, reason: 'url' };
    if (content.length > LONG_TEXT_THRESHOLD) return { keep: true, reason: 'long_text' };

    // Reply to a sharing parent → keep for context.
    if (referencedMessageQualifies) return { keep: true, reason: 'reply_to_sharing' };

    return { keep: false, reason: 'chat' };
}

/**
 * Sweep a single sharing channel. Returns the count of messages deleted.
 */
async function sweepChannel(
    client: MyClient,
    config: CleanerConfig,
): Promise<{ deleted: number; scanned: number; channelName: string }> {
    let channel: any = null;
    try {
        channel = await client.channels.fetch(config.channelId).catch(() => null);
    } catch { /* silent */ }
    if (!channel || (!('messages' in channel)) || !channel.bulkDelete) {
        // Not a text-based channel we can prune; mark and continue.
        return { deleted: 0, scanned: 0, channelName: config.channelId };
    }

    const textChannel = channel as TextChannel | NewsChannel | ThreadChannel;
    const channelName = (textChannel as any).name || config.channelId;

    let fetched: any;
    try {
        fetched = await textChannel.messages.fetch({ limit: SCAN_LIMIT });
    } catch (error) {
        console.error(`[SharingCleaner] fetch failed for ${channelName}:`, error);
        return { deleted: 0, scanned: 0, channelName };
    }

    const now = Date.now();
    const msgs = Array.from(fetched.values()) as DiscordMessage[];

    // Build the set of message IDs that qualify as sharing, so we can resolve
    // the reply-to-sharing rule against them.
    const qualifiesById = new Map<string, boolean>();
    for (const msg of msgs) {
        // Skip messages older than the bulk-delete window — they're untouchable
        // by this sweep (we don't fall back to per-message delete to stay
        // rate-limit safe).
        if (now - msg.createdTimestamp > MAX_AGE_MS) continue;
        const verdict = isSharingMessage(msg, config);
        qualifiesById.set(msg.id, verdict.keep);
    }

    const toDelete: DiscordMessage[] = [];
    let scanned = 0;
    for (const msg of msgs) {
        if (now - msg.createdTimestamp > MAX_AGE_MS) continue;
        scanned++;
        const repliedToId = msg.reference?.messageId;
        const referencedQualifies = repliedToId ? qualifiesById.get(repliedToId) : undefined;
        const { keep, reason } = isSharingMessage(msg, config, referencedQualifies);
        if (!keep) {
            toDelete.push(msg);
        } else {
            // For verbose debugging when needed:
            // console.log(`  keep: ${msg.id.slice(-6)} reason=${reason}`);
            void reason;
        }
    }

    if (toDelete.length === 0) {
        return { deleted: 0, scanned, channelName };
    }

    // Bulk delete in chunks of 100 (Discord max). Our scan already caps at 100
    // so one call is sufficient, but loop defensively.
    try {
        if (toDelete.length === 1) {
            await toDelete[0].delete().catch(() => undefined);
        } else {
            await textChannel.bulkDelete(toDelete, true);  // filterOld:true skips >14d items
        }
    } catch (error) {
        console.error(`[SharingCleaner] delete failed for ${channelName}:`, error);
        return { deleted: 0, scanned, channelName };
    }

    return { deleted: toDelete.length, scanned, channelName };
}

/**
 * Top-level entry: sweep every configured sharing channel.
 */
export async function cleanSharingChannels(client: MyClient): Promise<void> {
    let configs: any[] = [];
    try {
        configs = await SharingChannelConfigModel.find({}).lean();
    } catch (error) {
        console.error('[SharingCleaner] config load failed:', error);
        return;
    }
    if (configs.length === 0) {
        // Quiet — admin hasn't configured any sharing channels yet.
        return;
    }

    let totalDeleted = 0;
    let totalScanned = 0;
    for (const c of configs) {
        const cfg: CleanerConfig = {
            guildId: c.guildId,
            channelId: c.channelId,
            gracePeriodMin: typeof c.gracePeriodMin === 'number' ? c.gracePeriodMin : 30,
            exemptUserIds: Array.isArray(c.exemptUserIds) ? c.exemptUserIds : [],
            exemptRoleIds: Array.isArray(c.exemptRoleIds) ? c.exemptRoleIds : [],
        };
        const { deleted, scanned, channelName } = await sweepChannel(client, cfg);
        totalDeleted += deleted;
        totalScanned += scanned;
        if (deleted > 0 || scanned > 0) {
            console.log(`🧹 [SharingCleaner] #${channelName}: scanned=${scanned} deleted=${deleted}`);
        }
        // Bookkeeping: update last sweep stats.
        try {
            await SharingChannelConfigModel.updateOne(
                { _id: c._id },
                { $set: { lastSweepAt: new Date(), lastSweepDeleted: deleted } },
            );
        } catch { /* silent */ }
    }
    if (totalDeleted > 0) {
        console.log(`🧹 [SharingCleaner] sweep complete: ${totalDeleted} deleted across ${configs.length} channel(s) (scanned ${totalScanned})`);
    }
}
