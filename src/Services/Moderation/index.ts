import {
  Guild,
  Message as DiscordMessage,
  MessageReferenceType,
  OmitPartialGroupDMChannel,
  PermissionsBitField,
} from "discord.js";
import { SharingChannelConfigModel } from "../../Database/connect";
import { isNoDbMode } from "../../utils/env";
import { dhashFromBuffer, isPerceptualMatch } from "./imageHash";

type GuildMessage = OmitPartialGroupDMChannel<DiscordMessage<boolean>>;

/**
 * Anti-spam / anti-phishing moderation.
 *
 * Design goal: a *legitimate* user — especially someone forwarding messages or
 * sharing images / files / links, and any admin/mod — must NEVER be auto-kicked.
 * Only a genuine flood of the *same meaningful content* from a non-exempt,
 * kickable member escalates, and even then it is graduated (warn → timeout →
 * kick) so an accidental trigger is recoverable.
 *
 * Why the old version mis-fired: it compared the raw `message.content` string
 * for an exact 3-in-60s repeat. Forwarded messages, attachment-only messages,
 * sticker/embed-only messages and blank messages all carry `content === ""`, so
 * three of them in a minute collided as "the same message" and the user was
 * kicked + had 5 minutes of their messages purged across every channel. The new
 * model below never counts text-less messages toward the text rule.
 */

// ── Tunables ────────────────────────────────────────────────────────────────
const SPAM_WINDOW_MS = 60_000;          // rolling window for repeat detection
const FANOUT_WINDOW_MS = 15_000;        // tighter window for cross-channel raids
const STRIKE_DECAY_MS = 30 * 60_000;    // how long a strike lingers (slow leak)
const TIMEOUT_MS = 5 * 60_000;          // soft-punishment duration

const MIN_MEANINGFUL_LEN = 8;           // below this, text needs a higher count
const TEXT_SPAM_COUNT = 3;              // identical meaningful text in one channel
const SHORT_SPAM_COUNT = 6;             // identical short text (no url/mention)
const PAYLOAD_SPAM_COUNT = 4;           // identical forward/media payload, one channel
const FANOUT_DISTINCT_CHANNELS = 4;     // same content fanned across N channels

const CONFIG_TTL_MS = 60_000;           // exemption-config cache lifetime
const WARNING_AUTODELETE_MS = 20_000;   // auto-remove the in-channel warning

// Normalized ack/filler tokens that are never treated as spam regardless of
// repetition (kept small; the length floor already covers most short replies).
const ACK_ALLOWLIST = new Set<string>([
  "ok", "oke", "okay", "okok", "k", "kk", "+",
  "lol", "lmao", "lmaoo", "wkwk", "wkwkwk", "awok", "anjay", "anjir", "njir",
  "gg", "ggwp", "gege", "ty", "tysm", "thx", "thanks", "makasih", "mksh",
  "nice", "mantap", "mantul", "yes", "ya", "yoi", "yup", "no", "nah",
  "f", "rip", "wow", "sip", "siap", "p", "real", "fr", "based", "w", "l",
]);

const ZERO_WIDTH_RE = /[\u200B-\u200D\u2060\uFEFF]/g;
const URL_OR_INVITE_RE = /(https?:\/\/|www\.|discord(?:app)?\.com\/invite\/|discord\.gg\/)/i;
const MASS_MENTION_RE = /@(?:everyone|here)\b/;
const PHISHING_LURE_RE =
  /\b(?:free\s*nitro|nitro\s*gift|steam\s*gift|gift\s*card|air\s*drop|airdrop|claim\s+(?:your|now|here)|free\s*(?:robux|v-?bucks|gift)|crypto\s*(?:giveaway|airdrop)|50\$?\s*gift)\b/i;

// ── In-memory state (self-expiring) ─────────────────────────────────────────
interface RecentMessage {
  signature: string;        // "t:<normalized text>" or "p:<payload hash>"
  isPayload: boolean;       // signature came from media/forward payload
  hasUrlOrMention: boolean; // text carried a url/invite/mass-mention
  textLen: number;          // normalized text length (0 for payload signatures)
  channelId: string;
  timestamp: number;
  messageId: string;
}

interface Heat {
  strikes: number;
  lastStrikeAt: number;
}

const recentMessages: Record<string, RecentMessage[]> = {};
const heat: Record<string, Heat> = {};

// Periodic sweep — drops expired message buckets and decayed strike state so a
// long-running container never leaks memory for one-time visitors.
const moderationSweep = setInterval(() => {
  const now = Date.now();
  for (const userId of Object.keys(recentMessages)) {
    const fresh = recentMessages[userId].filter((m) => now - m.timestamp < SPAM_WINDOW_MS);
    if (fresh.length === 0) delete recentMessages[userId];
    else recentMessages[userId] = fresh;
  }
  for (const userId of Object.keys(heat)) {
    if (now - heat[userId].lastStrikeAt >= STRIKE_DECAY_MS) delete heat[userId];
  }
}, SPAM_WINDOW_MS);
moderationSweep.unref?.();

// ── Exemption config (sharing channels + exempt users/roles), DB-cached ──────
interface ModConfig {
  sharingChannelIds: Set<string>;
  exemptUserIds: Set<string>;
  exemptRoleIds: Set<string>;
}

let modConfig: ModConfig = {
  sharingChannelIds: new Set(),
  exemptUserIds: new Set(),
  exemptRoleIds: new Set(),
};
let modConfigAt = 0;
let modConfigLoading: Promise<void> | null = null;

async function refreshModerationConfig(): Promise<void> {
  try {
    const configs = (await SharingChannelConfigModel.find({}).lean()) as any[];
    const sharingChannelIds = new Set<string>();
    const exemptUserIds = new Set<string>();
    const exemptRoleIds = new Set<string>();
    for (const c of configs) {
      if (c?.channelId) sharingChannelIds.add(String(c.channelId));
      for (const u of Array.isArray(c?.exemptUserIds) ? c.exemptUserIds : []) exemptUserIds.add(String(u));
      for (const r of Array.isArray(c?.exemptRoleIds) ? c.exemptRoleIds : []) exemptRoleIds.add(String(r));
    }
    modConfig = { sharingChannelIds, exemptUserIds, exemptRoleIds };
    modConfigAt = Date.now();
  } catch (error) {
    // Retain the last-good config — never blow away exemptions because of a DB
    // hiccup, or sharers would lose protection for a full TTL. Retry soon.
    console.error("[Moderation] exemption config load failed, retaining last-good:", error);
    modConfigAt = Date.now() - (CONFIG_TTL_MS - 10_000);
  }
}

async function getModerationConfig(): Promise<ModConfig> {
  // No DB → no configurable sharing channels exist; owner check still applies.
  if (isNoDbMode()) return modConfig;
  if (Date.now() - modConfigAt >= CONFIG_TTL_MS) {
    if (!modConfigLoading) {
      modConfigLoading = refreshModerationConfig().finally(() => {
        modConfigLoading = null;
      });
    }
    // First-ever load blocks; afterwards serve stale-while-revalidate so the
    // message hot path never waits on Mongo.
    if (modConfigAt === 0) await modConfigLoading;
  }
  return modConfig;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Run a discord.js permission/feasibility getter that can throw (e.g. when
 * the bot's own member is uncached → GuildUncachedMe). Returns false on throw. */
function safeCan(getter: () => boolean): boolean {
  try {
    return getter();
  } catch {
    return false;
  }
}

function normalizeText(raw: string): string {
  return raw
    .normalize("NFKC")
    .replace(ZERO_WIDTH_RE, "")
    .toLowerCase()
    .replace(/\d+/g, " ") // collapse digit runs ANYWHERE (defeats counter suffixes)
    .replace(/\s+/g, " ")
    .trim();
}

/** Build a payload signature for a forwarded or media-only message. Two posts
 * with the SAME attachments / embeds / forwarded snapshot produce the same
 * signature; genuinely different forwards/media produce different ones. */
function payloadSignature(message: GuildMessage): string | null {
  const parts: string[] = [];

  const snap: any = (message as any).messageSnapshots?.first?.();
  if (snap) {
    const snapText = normalizeText(String(snap?.content ?? ""));
    if (snapText) parts.push("s:" + snapText);
    for (const a of snap?.attachments?.values?.() ?? []) parts.push(`a:${a?.name}:${a?.size}`);
    for (const e of snap?.embeds ?? []) parts.push(`e:${e?.url || e?.title || ""}`);
    for (const st of snap?.stickers?.values?.() ?? []) parts.push(`st:${st?.id ?? st?.name}`);
  }

  for (const a of message.attachments.values()) parts.push(`a:${a.name}:${a.size}`);
  for (const e of message.embeds) parts.push(`e:${e.url || e.title || ""}`);
  for (const st of message.stickers.values()) parts.push(`st:${st.id}`);

  parts.sort();
  const joined = parts.join("|");
  return joined.length > 0 ? joined : null;
}

interface Signature {
  signature: string;
  isPayload: boolean;
  hasUrlOrMention: boolean;
  textLen: number;
}

/** Derive the dedup signature for a message, or null if it must NOT be counted
 * toward spam at all (forwards with no repeatable payload, blank messages,
 * pure ack tokens). */
function buildSignature(message: GuildMessage): Signature | null {
  const rawText = message.content ?? "";
  const isForward =
    message.reference?.type === MessageReferenceType.Forward ||
    ((message as any).messageSnapshots?.size ?? 0) > 0;
  const hasMedia =
    message.attachments.size > 0 || message.embeds.length > 0 || message.stickers.size > 0;

  // A forward's identity is its payload, NOT any caption the user typed — so
  // three different forwards never collide even with an identical caption.
  if (isForward) {
    const sig = payloadSignature(message);
    return sig ? { signature: "p:" + sig, isPayload: true, hasUrlOrMention: false, textLen: 0 } : null;
  }

  const normText = normalizeText(rawText);
  if (normText.length > 0) {
    if (ACK_ALLOWLIST.has(normText)) return null;
    const hasUrlOrMention =
      URL_OR_INVITE_RE.test(rawText) || !!message.mentions?.everyone || MASS_MENTION_RE.test(rawText);
    return { signature: "t:" + normText, isPayload: false, hasUrlOrMention, textLen: normText.length };
  }

  // Text-less but carries media (image/file/embed/sticker only): only an
  // IDENTICAL repeat is suspicious, via the payload signature.
  if (hasMedia) {
    const sig = payloadSignature(message);
    return sig ? { signature: "p:" + sig, isPayload: true, hasUrlOrMention: false, textLen: 0 } : null;
  }

  return null; // blank / nothing to key on → never counted
}

/**
 * Is this author/channel exempt from moderation entirely?
 * Order matters: owner → sharing channel (incl. thread parent) → exempt
 * user/role → staff permissions. Staff detection is best-effort and fails OPEN
 * (treats as exempt) so a partial/uncached admin member is never punished; the
 * `kickable`/`moderatable` gate is the hard backstop regardless.
 */
async function isExemptFromModeration(message: GuildMessage): Promise<boolean> {
  const guild = message.guild;
  if (!guild) return true; // not a guild message → nothing to moderate

  if (guild.ownerId === message.author.id) return true;

  const cfg = await getModerationConfig();

  const channel: any = message.channel;
  if (cfg.sharingChannelIds.has(message.channelId)) return true;
  if (channel?.isThread?.() && channel.parentId && cfg.sharingChannelIds.has(channel.parentId)) return true;

  if (cfg.exemptUserIds.has(message.author.id)) return true;

  const member = message.member;
  if (member && cfg.exemptRoleIds.size > 0) {
    try {
      for (const roleId of member.roles.cache.keys()) {
        if (cfg.exemptRoleIds.has(roleId)) return true;
      }
    } catch {
      /* partial member → skip role exemption, fall through to perms/gate */
    }
  }

  if (member) {
    try {
      const perms = member.permissions;
      if (
        perms?.has(PermissionsBitField.Flags.Administrator) ||
        perms?.has(PermissionsBitField.Flags.KickMembers) ||
        perms?.has(PermissionsBitField.Flags.BanMembers) ||
        perms?.has(PermissionsBitField.Flags.ManageMessages) ||
        perms?.has(PermissionsBitField.Flags.ManageGuild)
      ) {
        return true;
      }
    } catch {
      /* partial member whose permissions can't be read → leave to kick gate */
    }
  }

  return false;
}

async function notifyUser(message: GuildMessage, text: string): Promise<void> {
  try {
    await message.author.send(text);
  } catch {
    /* user has DMs closed — the in-channel warning covers context */
  }
}

async function warnInChannel(message: GuildMessage, text: string): Promise<void> {
  try {
    const channel: any = message.channel;
    if (channel?.send) {
      const warning = await channel.send({ content: `<@${message.author.id}> ${text}` });
      setTimeout(() => {
        warning?.delete?.().catch(() => undefined);
      }, WARNING_AUTODELETE_MS).unref?.();
    }
  } catch {
    /* ignore — warning is best-effort */
  }
}

/** Delete only the matched messages, grouped per channel, using bulkDelete
 * (with a single-message fallback). No guild-wide scan, no per-message fetch
 * storm. Targets are minutes old, well inside the 14-day bulk-delete window.
 *
 * Every failure is LOGGED, never swallowed: the 2026-06-07 incident proved a
 * fully-silent deletion path is undiagnosable (a scam message survived and the
 * logs said nothing). Ids are deduped per channel — duplicate ids would make
 * bulkDelete's 2-100 unique-id requirement misfire. */
async function deleteMatchedMessages(
  message: GuildMessage,
  matched: Pick<RecentMessage, "channelId" | "messageId">[],
): Promise<void> {
  const byChannel = new Map<string, Set<string>>();
  for (const r of matched) {
    const set = byChannel.get(r.channelId) ?? new Set<string>();
    set.add(r.messageId);
    byChannel.set(r.channelId, set);
  }

  let deleted = 0;
  let failed = 0;
  for (const [channelId, idSet] of byChannel) {
    const ids = [...idSet];
    try {
      const channel: any =
        channelId === message.channelId
          ? message.channel
          : message.guild
            ? await message.guild.channels.fetch(channelId).catch((e: unknown) => {
                console.log(`[Moderation] channel fetch ${channelId} failed: ${e}`);
                return null;
              })
            : null;
      if (!channel) {
        failed += ids.length;
        console.log(`[Moderation] cannot resolve channel ${channelId} — skipping ${ids.length} deletion(s)`);
        continue;
      }

      if (ids.length === 1) {
        const single = await channel.messages?.fetch(ids[0]).catch((e: any) => {
          console.log(`[Moderation] fetch msg ${ids[0]} in ${channelId} failed: ${e?.code ?? e}`);
          return null;
        });
        if (!single) {
          failed++;
          continue;
        }
        const ok = await Promise.resolve(single.delete?.())
          .then(() => true)
          .catch((e: any) => {
            console.log(`[Moderation] delete msg ${ids[0]} in ${channelId} failed: ${e?.code ?? e}`);
            return false;
          });
        ok ? deleted++ : failed++;
      } else if (typeof channel.bulkDelete === "function") {
        const ok = await Promise.resolve(channel.bulkDelete(ids, true))
          .then(() => true)
          .catch((e: any) => {
            console.log(`[Moderation] bulkDelete ${ids.length} msgs in ${channelId} failed: ${e?.code ?? e}`);
            return false;
          });
        ok ? (deleted += ids.length) : (failed += ids.length);
      }
    } catch (error) {
      failed += ids.length;
      console.log(`[Moderation] could not delete matched messages in ${channelId}: ${error}`);
    }
  }
  console.log(`[Moderation] matched-message cleanup: deleted ${deleted}, failed ${failed}`);
}

/** How far back a softban purges the removed scammer's messages. Matches the
 * image-scam ring window — anything older was posted before the campaign. */
const SOFTBAN_PURGE_SECONDS = 60 * 60;

/** Remove a CONFIRMED scammer and purge their recent messages everywhere.
 *
 * Prefers a SOFTBAN — ban with a 1h server-wide message purge, then an
 * immediate unban — which keeps kick semantics (they can rejoin) while Discord
 * itself deletes EVERY message they sent in the window, in every channel. This
 * is what guarantees cleanup even for messages we never matched: on 2026-06-07
 * a scam message survived because its image downloads failed before hashing, so
 * per-message deletion never knew about it. Falls back to a plain kick when
 * banning isn't possible. Only ever called on high-confidence confirmations —
 * the decision of WHO gets removed is unchanged, only the cleanup is stronger. */
async function removeAndPurge(message: GuildMessage, member: any, reason: string): Promise<void> {
  const canBan = safeCan(() => member.bannable) && typeof member.ban === "function";
  if (canBan) {
    try {
      await member.ban({ deleteMessageSeconds: SOFTBAN_PURGE_SECONDS, reason });
      try {
        await (message.guild as any)?.members?.unban?.(message.author.id, "Softban purge complete — rejoining allowed");
      } catch (error) {
        console.log(`[Moderation] unban after softban failed for ${message.author.id}: ${error}`);
      }
      console.log(`[Moderation] softban-purged ${message.author.id}: ${reason}`);
      return;
    } catch (error) {
      console.log(`[Moderation] softban failed for ${message.author.id}, falling back to kick: ${error}`);
    }
  }
  try {
    await member.kick(reason);
  } catch (error) {
    console.log(`[Moderation] kick failed for ${message.author.id}: ${error}`);
  }
}

/** Strikes are namespaced per detector LANE ("spam" | "phish" | "image") so
 * three UNRELATED borderline events can't sum into a kick. Escalation now
 * reflects repetition of the SAME kind of offence, not an aggregate of
 * different heuristics each firing once (2026-06-09 audit fix — that aggregate
 * could kick an innocent who tripped one image warn and one phishing warn). */
type ModLane = "spam" | "phish" | "image";
const heatKey = (userId: string, lane: ModLane): string => `${userId}:${lane}`;

/** Record a strike against a user in a given lane and return the new level.
 * Strikes decay after STRIKE_DECAY_MS so a one-off offence never lingers, while
 * a repeat offender in the same lane keeps climbing toward a kick. */
function bumpStrike(userId: string, lane: ModLane): number {
  const now = Date.now();
  const key = heatKey(userId, lane);
  const prior = heat[key];
  const level = prior && now - prior.lastStrikeAt < STRIKE_DECAY_MS ? prior.strikes + 1 : 1;
  heat[key] = { strikes: level, lastStrikeAt: now };
  return level;
}

/** Clear ALL lanes for a user (after they've been removed). */
function clearHeat(userId: string): void {
  for (const lane of ["spam", "phish", "image"] as ModLane[]) delete heat[heatKey(userId, lane)];
}

/** Graduated enforcement: strike 1 = delete dupes + warn, strike 2 = timeout,
 * strike 3+ = kick. Strikes decay slowly so a paced abuser still climbs the
 * ladder, while a one-off accidental burst only ever earns a recoverable warn. */
async function enforce(
  message: GuildMessage,
  userId: string,
  signature: string,
  matched: RecentMessage[],
): Promise<void> {
  const level = bumpStrike(userId, "spam");

  // Remove the handled records so the same messages don't re-trigger on the
  // next message; the strike map (not the bucket) carries escalation state.
  recentMessages[userId] = (recentMessages[userId] ?? []).filter((r) => r.signature !== signature);

  await deleteMatchedMessages(message, matched);

  const member = message.member;
  const canKick = !!member && (safeCan(() => member.kickable) || safeCan(() => (member as any).bannable));
  const canTimeout = !!member && safeCan(() => member.moderatable);

  if (level >= 3 && canKick) {
    await notifyUser(
      message,
      "You were removed for repeatedly posting the same content after warnings. You're welcome to rejoin — just don't flood the same message.",
    );
    await removeAndPurge(message, member!, "Repeated spam after warning and timeout");
    clearHeat(userId);
    return;
  }

  if (level >= 2 && canTimeout) {
    try {
      await member!.timeout(TIMEOUT_MS, "Repeated spam");
    } catch (error) {
      console.log(`[Moderation] timeout failed for ${userId}: ${error}`);
    }
    await warnInChannel(message, "you've been timed out briefly for repeatedly posting the same thing. please stop.");
    await notifyUser(message, "You've been timed out for 5 minutes for repeatedly posting the same content.");
    return;
  }

  // Strike 1 (or higher when the member can't be timed out/kicked): warn only.
  await warnInChannel(
    message,
    "please don't post the same thing repeatedly — your duplicate messages were removed. continued spam may lead to a timeout.",
  );
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Spam detection. Returns true if the message was handled as spam (caller
 * should stop further processing). Never throws on the hot path.
 */
export async function handleSpamDetection(message: GuildMessage): Promise<boolean> {
  try {
    if (message.author.bot || !message.guild) return false;
    if (await isExemptFromModeration(message)) return false;

    const userId = message.author.id;
    const now = Date.now();

    const bucket = (recentMessages[userId] ?? []).filter((m) => now - m.timestamp < SPAM_WINDOW_MS);
    recentMessages[userId] = bucket;

    const sig = buildSignature(message);
    if (!sig) {
      if (bucket.length === 0) delete recentMessages[userId];
      return false; // forwards / media-only / blank / ack → never counted
    }

    bucket.push({
      signature: sig.signature,
      isPayload: sig.isPayload,
      hasUrlOrMention: sig.hasUrlOrMention,
      textLen: sig.textLen,
      channelId: message.channelId,
      timestamp: now,
      messageId: message.id,
    });

    const sameSig = bucket.filter((m) => m.signature === sig.signature);
    const sameChannel = sameSig.filter((m) => m.channelId === message.channelId);

    // Threshold depends on content quality: meaningful or link/mention-bearing
    // text trips at 3; short filler needs more; identical payloads need 4.
    let threshold: number;
    if (sig.isPayload) threshold = PAYLOAD_SPAM_COUNT;
    else if (sig.textLen >= MIN_MEANINGFUL_LEN || sig.hasUrlOrMention) threshold = TEXT_SPAM_COUNT;
    else threshold = SHORT_SPAM_COUNT;

    // Cross-channel raid: same content fanned across many channels fast.
    const fanoutChannels = new Set(
      sameSig.filter((m) => now - m.timestamp < FANOUT_WINDOW_MS).map((m) => m.channelId),
    ).size;

    const isSpam = sameChannel.length >= threshold || fanoutChannels >= FANOUT_DISTINCT_CHANNELS;
    if (!isSpam) return false;

    await enforce(message, userId, sig.signature, sameSig);
    return true;
  } catch (error) {
    console.error("[Moderation] handleSpamDetection error:", error);
    return false; // moderation must never break message handling
  }
}

/** Pull together every piece of text a message carries that a scammer might
 * stuff a link/lure into — the raw content PLUS any embed url/title/description
 * /author/footer. An image-only scam frequently has empty `content` and hides
 * the link inside a link-preview embed (or inside the image itself, which we
 * can't read — see the media branch in handlePhishingDetection). */
function phishingHaystack(message: GuildMessage): string {
  const parts: string[] = [message.content || ""];
  for (const e of message.embeds) {
    const anyE = e as any;
    parts.push(anyE?.url || "", anyE?.title || "", anyE?.description || "", anyE?.author?.name || "", anyE?.footer?.text || "");
  }
  return parts.filter(Boolean).join(" ");
}

/**
 * Phishing/scam detection. Requires a PRIMARY signal — a real link/invite OR an
 * attached image/media that could hide one (QR code, screenshot of a "free
 * nitro" page; we have no vision so we can't read inside it) — PLUS a strong
 * SECOND signal (mass-mention or a known lure phrase). That keeps ordinary
 * link-sharing AND ordinary image-sharing untouched, while closing the hole
 * where an image-only @everyone scam slipped past entirely (the old code bailed
 * on `if (!hasLink) return false`, and a single image never reaches the spam
 * payload threshold). Soft-action first (delete + timeout); mass-mention raids
 * escalate to kick.
 */
export async function handlePhishingDetection(message: GuildMessage): Promise<boolean> {
  try {
    if (message.author.bot || !message.guild) return false;
    if (await isExemptFromModeration(message)) return false;

    const content = message.content || "";
    const haystack = phishingHaystack(message);
    const hasLink = URL_OR_INVITE_RE.test(haystack);
    // Media we can't see into (image/sticker/embed) is treated as a possible
    // carrier — but only ever actioned when a strong second signal is present.
    const hasMedia =
      message.attachments.size > 0 || message.embeds.length > 0 || message.stickers.size > 0;
    if (!hasLink && !hasMedia) return false; // plain text with no link/media → not our job

    const massMention = !!message.mentions?.everyone || MASS_MENTION_RE.test(content);
    const hasLure = PHISHING_LURE_RE.test(haystack);
    if (!massMention && !hasLure) return false; // bare invite / plain image-share is fine

    await message.delete().catch(() => undefined);

    const member = message.member;
    const canKick = !!member && (safeCan(() => member.kickable) || safeCan(() => (member as any).bannable));
    const canTimeout = !!member && safeCan(() => member.moderatable);

    // Immediate REMOVAL on an unambiguous raid: a *readable* scam (known lure
    // phrase or actual link) PLUS the @everyone ping. We deliberately do NOT
    // remove on mass-mention + unreadable-image alone — that could be an
    // innocent member pinging an event screenshot, and we have no vision to
    // confirm.
    if (massMention && (hasLure || hasLink) && canKick) {
      await notifyUser(message, "Your message was removed and you were removed from the server for posting a phishing/scam link with a mass mention. Contact a moderator if this was a mistake.");
      await removeAndPurge(message, member!, "Posting phishing/scam links with mass mention");
      clearHeat(message.author.id);
      return true;
    }

    // Graduated escalation for the non-@everyone case (lure+link without a mass
    // mention). This OVERLAPS legitimate CTF vocabulary — "claim your flag",
    // "free points", a writeup link — so the first hit is only a recoverable
    // WARN (the message is removed, no timeout), climbing to timeout then kick
    // only on repeat. (2026-06-09 audit fix: the old path timed-out on the very
    // first such message and kicked on the second, punishing innocents for
    // ordinary CTF phrasing.) Strikes live in the "phish" lane only.
    const level = bumpStrike(message.author.id, "phish");

    if (level >= 3 && canKick) {
      await notifyUser(
        message,
        "You were removed for repeatedly posting phishing/scam content after warnings. You're welcome to appeal to a moderator if this was a mistake.",
      );
      await removeAndPurge(message, member!, "Repeated phishing/scam after warnings");
      clearHeat(message.author.id);
      return true;
    }

    if (level >= 2 && canTimeout) {
      try {
        await member!.timeout(TIMEOUT_MS, "Repeated phishing/scam links");
      } catch (error) {
        console.log(`[Moderation] phishing timeout failed for ${message.author.id}: ${error}`);
      }
      await notifyUser(
        message,
        "Your message was removed and you were timed out for repeatedly posting content that looks like a phishing/scam link. Contact a moderator if this was a mistake.",
      );
      return true;
    }

    // Strike 1: remove the message + warn only. Recoverable — an innocent who
    // used scam-shaped wording once is never timed out or kicked.
    await notifyUser(
      message,
      "Your message was removed because it looked like a phishing/scam link. If this was a mistake, contact a moderator. Repeated posts will get you timed out, then removed.",
    );
    return true;
  } catch (error) {
    console.error("[Moderation] handlePhishingDetection error:", error);
    return false;
  }
}

// ── Image-scam detection (perceptual hashing) ────────────────────────────────
/**
 * Catches the scam pattern byte-hash dedup can't: the SAME scam image re-encoded
 * per account so sha256 / name:size all differ. We fingerprint each image with a
 * perceptual dHash (see ./imageHash) and correlate across accounts and channels.
 *
 * Two confidence levels, to honour the never-remove-an-innocent rule:
 *   INSTANT removal (high confidence) when the image either
 *     - matches a still-valid learned scam fingerprint (known set), OR
 *     - is fanned by ONE account across ≥3 channels within 30s (solo raid).
 *   GRADUATED (delete copies + warn→timeout→softban) — never an instant ban —
 *   for the ambiguous tiers, where an innocent could plausibly match:
 *     - the same image from ≥2 distinct accounts within a tight window (ring) —
 *       because two strangers reposting the same meme also matches this,
 *     - the same image to ≥3 channels paced over minutes (slow fan-out),
 *     - a fat multi-image set fanned to ≥2 channels (multi-image flood).
 * Only the solo-raid tier auto-learns into the known set, and learned hashes
 * age out (KNOWN_SCAM_TTL_MS) so a stray match never becomes permanent.
 */
const IMG_FANOUT_CHANNELS = 3;            // same image to N channels by one account
const IMG_FANOUT_WINDOW_MS = 30_000;      // …within this span → solo raid
// Paced raid (2026-06-07 evasion): same image to ≥3 channels but ~1min apart —
// outside the 30s raid window. Too ambiguous for instant removal (an innocent
// might cross-post one image to a few channels), so this tier only deletes the
// copies and climbs the shared strike ladder: warn → timeout → removal.
const IMG_SLOW_FANOUT_WINDOW_MS = 10 * 60_000;
// Two-channel multi-image flood (2026-06-08 evasion: zakayartistry dropped the
// SAME 4-image scam set to 2 channels in 5s — under the 3-channel floor). When
// the SAME image lands in ≥2 channels AND it arrived inside a fat multi-image
// message (≥3 attachments), that's the scam-set-fanned shape, not an innocent
// one-screenshot cross-post. Still graduated (delete + warn → timeout →
// removal), never instant — a player sharing a 4-shot writeup to two channels
// only loses the copies and gets a warning.
const IMG_MULTI_IMG_FANOUT_CHANNELS = 2;  // same image to N channels…
const IMG_MULTI_IMG_MIN_ATTACH = 3;       // …when the message carried ≥N images
const IMG_MULTI_IMG_WINDOW_MS = 10 * 60_000;
// Cross-account "ring": the SAME image from ≥N distinct accounts. This is
// AMBIGUOUS on a big server — two strangers reposting the same meme/scoreboard
// also matches — so it is GRADUATED (delete copies + strike ladder), NEVER an
// instant softban, and is never learned into the known-scam set. A genuinely
// coordinated ring also fans each account across channels, which the per-account
// fan-out tier catches instantly anyway. (2026-06-09 audit fix: the old code
// instant-softbanned the 2nd of any two accounts posting the same image within
// an HOUR — softbanning innocent meme-reposters and poisoning the known set.)
const IMG_RING_MIN_ACCOUNTS = 2;          // same image from N distinct accounts…
const IMG_RING_COORD_WINDOW_MS = 10 * 60_000; // …within this tight window → ring signal
const IMG_CLUSTER_TTL_MS = 60 * 60_000;   // how long an image cluster is retained
const IMG_MAX_ATTACH = 4;                 // decode at most N images per message
const IMG_MAX_BYTES = 4 * 1024 * 1024;    // skip images larger than this
const IMG_FETCH_TIMEOUT_MS = 6_000;
const ATTACH_CACHE_CAP = 5_000;           // bound the attachment→hash cache
const KNOWN_SCAM_CAP = 2_000;             // bound the learned-scam fingerprint set
const KNOWN_SCAM_TTL_MS = 24 * 60 * 60_000; // auto-learned scam hashes age out (poisoning guard)
const IMG_CLUSTER_CAP = 4_000;            // hard cap on retained image clusters

interface ImgPoster {
  channels: Set<string>;
  firstTs: number;
  lastTs: number;
  refs: { channelId: string; messageId: string }[];
}
interface ImgCluster {
  hash: bigint;
  posters: Map<string, ImgPoster>;
  lastTs: number;
}

const imgClusters: ImgCluster[] = [];
// Auto-learned scam fingerprints carry their learn time so they age out — a
// stale or wrongly-learned hash must not stay a permanent instant-removal
// tripwire (2026-06-09 audit fix).
const knownScamHashes: { hash: bigint; addedAt: number }[] = [];
const attachHashCache = new Map<string, bigint>(); // attachment id → dHash (never decode twice)

/** True if the hash perceptually matches a still-valid (non-expired) learned
 * scam fingerprint. */
function matchesKnownScam(hash: bigint, now: number): boolean {
  return knownScamHashes.some((k) => now - k.addedAt <= KNOWN_SCAM_TTL_MS && isPerceptualMatch(k.hash, hash));
}

function pruneImageState(now: number): void {
  for (let i = imgClusters.length - 1; i >= 0; i--) {
    if (now - imgClusters[i].lastTs > IMG_CLUSTER_TTL_MS) imgClusters.splice(i, 1);
  }
  // Hard cap on cluster count (oldest-first) so an image-heavy hour can't grow
  // the linear-scanned array without bound.
  if (imgClusters.length > IMG_CLUSTER_CAP) {
    imgClusters.sort((a, b) => a.lastTs - b.lastTs).splice(0, imgClusters.length - IMG_CLUSTER_CAP);
  }
  // Drop expired learned hashes, then cap.
  for (let i = knownScamHashes.length - 1; i >= 0; i--) {
    if (now - knownScamHashes[i].addedAt > KNOWN_SCAM_TTL_MS) knownScamHashes.splice(i, 1);
  }
  if (attachHashCache.size > ATTACH_CACHE_CAP) attachHashCache.clear();
  if (knownScamHashes.length > KNOWN_SCAM_CAP) knownScamHashes.splice(0, knownScamHashes.length - KNOWN_SCAM_CAP);
}

export interface ImageScamDecision {
  /** High-confidence scam (known-scam set match OR one account fanning the same
   * image across ≥3 channels in 30s) → immediate removal. */
  confirmed: boolean;
  /** Ambiguous-but-suspicious (≥2 accounts posting the same image — a "ring", OR
   * same image to ≥3 channels paced over minutes, OR a fat multi-image set
   * fanned to ≥2 channels) → delete copies + strike ladder, never instant
   * removal. */
  escalate: boolean;
  reason: string;
  matched: { channelId: string; messageId: string }[];
  /** The cluster's representative hash — lets enforcement add it to the
   * known-scam set once an escalation climbs to removal. */
  clusterHash: bigint;
}

/** Record one image fingerprint and decide whether it confirms a scam. Pure over
 * module state (no IO) so the correlation rules are unit-testable directly. */
export function evaluateImageFingerprint(
  userId: string,
  channelId: string,
  messageId: string,
  hash: bigint,
  now: number,
  opts?: { multiImage?: boolean },
): ImageScamDecision {
  const known = matchesKnownScam(hash, now);

  let cluster = imgClusters.find((c) => isPerceptualMatch(c.hash, hash));
  if (!cluster) {
    cluster = { hash, posters: new Map(), lastTs: now };
    imgClusters.push(cluster);
  }
  cluster.lastTs = now;

  let poster = cluster.posters.get(userId);
  if (!poster) {
    poster = { channels: new Set(), firstTs: now, lastTs: now, refs: [] };
    cluster.posters.set(userId, poster);
  }
  poster.channels.add(channelId);
  poster.lastTs = now;
  // One ref per message — a multi-attachment message evaluates once per hash,
  // and duplicate ids would corrupt the bulk-delete grouping downstream.
  if (!poster.refs.some((r) => r.messageId === messageId)) {
    poster.refs.push({ channelId, messageId });
  }

  // Solo fan-out: one account spraying the same image across many channels fast.
  // This is a strong, unambiguous signal (an innocent doesn't blast one image to
  // 3+ channels in 30s) → instant removal, and the only auto-learned tier.
  const fanout = poster.channels.size >= IMG_FANOUT_CHANNELS && now - poster.firstTs <= IMG_FANOUT_WINDOW_MS;

  const confirmed = known || fanout;
  // Learn ONLY from a tight solo fan-out (never from a ring or a known echo) —
  // and stamp the learn time so it ages out.
  if (fanout && !known) knownScamHashes.push({ hash: cluster.hash, addedAt: now });

  // Cross-account ring: same image from ≥2 distinct accounts within a tight
  // coordination window. AMBIGUOUS (two strangers can repost the same meme), so
  // GRADUATED — delete copies + strike ladder, NEVER an instant softban, and
  // never learned. A real coordinated ring also fans each account across
  // channels, which the solo fan-out tier above already catches instantly.
  const distinctAccounts = [...cluster.posters.values()].filter((p) => now - p.lastTs <= IMG_RING_COORD_WINDOW_MS).length;
  const ring = !confirmed && distinctAccounts >= IMG_RING_MIN_ACCOUNTS;

  // Paced fan-out: enough channels for a raid, too slow for the tight window.
  // NOT added to the known set here — an innocent cross-poster's image must
  // never auto-remove the next person who posts it.
  const slowFanout =
    !confirmed && poster.channels.size >= IMG_FANOUT_CHANNELS && now - poster.firstTs <= IMG_SLOW_FANOUT_WINDOW_MS;

  // Two-channel multi-image flood: same image to ≥2 channels, and it rode in on
  // a fat multi-image message — the scam-set-fanned shape. Graduated, like slow
  // fan-out.
  const multiImageFanout =
    !confirmed &&
    !slowFanout &&
    !!opts?.multiImage &&
    poster.channels.size >= IMG_MULTI_IMG_FANOUT_CHANNELS &&
    now - poster.firstTs <= IMG_MULTI_IMG_WINDOW_MS;

  const escalate = ring || slowFanout || multiImageFanout;

  const matched = [...cluster.posters.values()].flatMap((p) => p.refs);
  const spread = `same image across ${poster.channels.size} channels in ${Math.round((now - poster.firstTs) / 1000)}s`;
  const reason = known
    ? "matches a known scam image"
    : ring
      ? `same image from ${distinctAccounts} accounts`
      : slowFanout
        ? `${spread} (paced fan-out)`
        : multiImageFanout
          ? `${spread} (multi-image flood)`
          : spread;
  return { confirmed, escalate, reason, matched, clusterHash: cluster.hash };
}

function isImageAttachment(a: any): boolean {
  if (typeof a.contentType === "string" && a.contentType.startsWith("image/")) return true;
  const name: string = a.name ?? "";
  const ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
  return ["png", "jpg", "jpeg", "gif", "webp", "bmp", "avif"].includes(ext);
}

/** Download an image, retrying once — a transient CDN hiccup during a raid
 * burst (the bot is downloading a dozen images at once) must not silently
 * drop a scam image out of correlation. */
async function fetchImageBuffer(url: string): Promise<Buffer | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), IMG_FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      return buf.length > IMG_MAX_BYTES ? null : buf;
    } catch {
      /* retry once, then give up */
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

/** Download + perceptually hash a message's image attachments (cached per id).
 * Failures are logged — a hash that silently never happens is a scam message
 * that silently never gets matched. */
async function hashMessageImages(message: GuildMessage): Promise<bigint[]> {
  const atts = [...message.attachments.values()].filter(isImageAttachment).slice(0, IMG_MAX_ATTACH);
  const out: bigint[] = [];
  let failures = 0;
  for (const a of atts) {
    const cached = attachHashCache.get(a.id);
    if (cached !== undefined) {
      out.push(cached);
      continue;
    }
    if ((a.size ?? 0) > IMG_MAX_BYTES) continue;
    const buf = await fetchImageBuffer(a.url);
    if (!buf) {
      failures++;
      continue;
    }
    const h = await dhashFromBuffer(buf);
    if (h === null) {
      failures++;
      continue;
    }
    attachHashCache.set(a.id, h);
    out.push(h);
  }
  if (failures > 0) {
    console.log(`[Moderation] image hashing: ${failures}/${atts.length} attachment(s) failed for msg ${message.id} in ${message.channelId}`);
  }
  return out;
}

/**
 * Perceptual image-scam detection. Returns true if handled (caller stops). Only
 * decodes images for NON-exempt authors who actually attached an image, so the
 * cost stays off the normal text hot path. High-confidence triggers (known
 * scam, multi-account, multi-channel) remove the member directly; the offending
 * copies across every channel are deleted in one pass.
 */
export async function handleImageScamDetection(
  message: GuildMessage,
  opts?: { hashesForTest?: bigint[]; nowForTest?: number; multiImageForTest?: boolean },
): Promise<boolean> {
  try {
    if (message.author.bot || !message.guild) return false;
    const imageAttachments = [...message.attachments.values()].filter(isImageAttachment);
    if (imageAttachments.length === 0) return false;
    if (await isExemptFromModeration(message)) return false;

    const now = opts?.nowForTest ?? Date.now();
    pruneImageState(now);

    // A "fat" multi-image message is the scam-set-fanned shape; it lets the
    // 2-channel flood tier fire (a single cross-posted screenshot does not).
    const multiImage = opts?.multiImageForTest ?? imageAttachments.length >= IMG_MULTI_IMG_MIN_ATTACH;

    const hashes = opts?.hashesForTest ?? (await hashMessageImages(message));
    if (hashes.length === 0) {
      // Every attachment failed to download/decode (or all were oversized).
      // This is exactly the silent path that let a scam message survive the
      // 2026-06-07 fan-out — never skip it quietly again.
      console.log(
        `[Moderation] image-scam: 0 hashable images for msg ${message.id} by ${message.author.id} in ${message.channelId} (${message.attachments.size} attachment(s)) — skipping correlation`,
      );
      return false;
    }

    let decision: ImageScamDecision | null = null;
    let escalation: ImageScamDecision | null = null;
    for (const h of hashes) {
      const d = evaluateImageFingerprint(message.author.id, message.channelId, message.id, h, now, { multiImage });
      if (d.confirmed) {
        decision = d;
        break;
      }
      if (d.escalate && !escalation) escalation = d;
    }

    const member = message.member;
    const canKick = !!member && (safeCan(() => member.kickable) || safeCan(() => (member as any).bannable));
    const canTimeout = !!member && safeCan(() => member.moderatable);

    // High-confidence confirmation (known set / ring / tight fan-out) →
    // immediate removal, as before.
    if (decision) {
      await deleteMatchedMessages(message, decision.matched);
      if (canKick) {
        await notifyUser(
          message,
          "You were removed for posting a scam image (it matched a coordinated spam campaign). Contact a moderator if this was a mistake.",
        );
        await removeAndPurge(message, member!, "Scam image — perceptual match");
      } else if (canTimeout) {
        try {
          await member!.timeout(TIMEOUT_MS, "Scam image — perceptual match");
        } catch (error) {
          console.log(`[Moderation] image-scam timeout failed for ${message.author.id}: ${error}`);
        }
      }
      console.log(`[Moderation] image-scam handled for ${message.author.id}: ${decision.reason}`);
      return true;
    }

    // Paced fan-out (the 2026-06-07 kmndg evasion: same image to ≥3 channels,
    // ~1min apart — outside the raid window). Ambiguous on its own, so NEVER an
    // instant removal: delete the copies and climb the shared strike ladder.
    // A persistent scammer reaches removal on his next wave; an innocent
    // cross-poster only ever loses the duplicate copies and gets a warning.
    if (escalation) {
      await deleteMatchedMessages(message, escalation.matched);
      const level = bumpStrike(message.author.id, "image");

      if (level >= 3 && canKick) {
        await notifyUser(
          message,
          "You were removed for repeatedly spreading the same image across channels after warnings. Contact a moderator if this was a mistake.",
        );
        await removeAndPurge(message, member!, "Repeated image fan-out after warnings — scam pattern");
        // Removal-grade now — remember the image so reposts die instantly (ages
        // out via KNOWN_SCAM_TTL_MS).
        knownScamHashes.push({ hash: escalation.clusterHash, addedAt: now });
        clearHeat(message.author.id);
      } else if (level >= 2 && canTimeout) {
        try {
          await member!.timeout(TIMEOUT_MS, "Repeated image fan-out across channels");
        } catch (error) {
          console.log(`[Moderation] image fan-out timeout failed for ${message.author.id}: ${error}`);
        }
        await warnInChannel(message, "you've been timed out briefly for spreading the same image across channels. please stop.");
        await notifyUser(message, "You've been timed out for 5 minutes for posting the same image across multiple channels.");
      } else {
        await warnInChannel(
          message,
          "please don't post the same image across multiple channels — the copies were removed. continued spreading may lead to a timeout.",
        );
        await notifyUser(message, "Your image was posted across several channels, so the copies were removed. Feel free to post it again — in one channel only.");
      }
      console.log(`[Moderation] image fan-out escalation (strike ${level}) for ${message.author.id}: ${escalation.reason}`);
      return true;
    }

    return false;
  } catch (error) {
    console.error("[Moderation] handleImageScamDetection error:", error);
    return false;
  }
}

/** Test-only: clear perceptual-scam state between cases. */
export function __resetImageScamState(): void {
  imgClusters.length = 0;
  knownScamHashes.length = 0;
  attachHashCache.clear();
}

// Recursively sanitize content to remove @everyone, @here, and role mentions
export function sanitizeMentions(content: string | object | any[], guild?: Guild | null): any {
  // Handle strings
  if (typeof content === 'string') {
    let sanitized = content
      .replace(/@everyone/gi, '@\u200beveryone') // Insert zero-width space
      .replace(/@here/gi, '@\u200bhere'); // Insert zero-width space

    // Handle role mentions: <@&roleId> -> @<rolet>
    if (guild) {
      sanitized = sanitized.replace(/<@&(\d+)>/g, (match, roleId) => {
        try {
          const role = guild.roles.cache.get(roleId);
          if (role) {
            return `@${role.name}`;
          }
          return '@rolet'; // Fallback if role not found
        } catch (error) {
          return '@rolet'; // Fallback on error
        }
      });
    } else {
      // If no guild provided, just replace with generic placeholder
      sanitized = sanitized.replace(/<@&\d+>/g, '@<rolet>');
    }

    return sanitized;
  }

  // Handle arrays
  if (Array.isArray(content)) {
    return content.map(item => sanitizeMentions(item, guild));
  }

  // Handle objects (including null)
  if (content && typeof content === 'object') {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(content)) {
      sanitized[key] = sanitizeMentions(value, guild);
    }
    return sanitized;
  }

  // Return primitive values unchanged
  return content;
}
