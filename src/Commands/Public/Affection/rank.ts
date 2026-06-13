import { SubCommand } from "../../../Model/command";
import { EmbedBuilder, SlashCommandSubcommandBuilder } from "discord.js";
import { UserProfileModel } from "../../../Database/connect";

// Safety ceiling on how many profiles (warmest first) we pull as ranking
// candidates. IMPORTANT: this is a GLOBAL budget — profiles are one-per-user
// across every guild (no guildId on the schema), so the top-N by affection is
// taken across all guilds the bot serves and only THEN filtered to this guild's
// members. At the community's current scale the positive-affection population
// sits well under this, so the board is exact; if the cap is ever hit we flag
// the board as possibly-incomplete rather than silently claiming completeness.
const CANDIDATE_CAP = 500;

// Discord's REQUEST_GUILD_MEMBERS gateway op accepts at most 100 user IDs per
// request and discord.js does NOT chunk it for us — so we resolve uncached
// candidates in batches of this size ourselves.
const MEMBER_FETCH_BATCH = 100;

// Without this each gateway member-fetch inherits discord.js's 120s default
// timeout; a single dropped GUILD_MEMBERS_CHUNK (shard hiccup) would then pin
// the command for two minutes. Batches run concurrently, so total wait on a
// stall is ~one timeout, not the sum.
const MEMBER_FETCH_TIMEOUT_MS = 10_000;

// Per-user cooldown. The command forces gateway member-resolution, so without a
// throttle one user could spam it and generate sustained REQUEST_GUILD_MEMBERS
// traffic on the shared shard.
const COOLDOWN_MS = 15_000;
const lastUsedAt = new Map<string, number>(); // `${guildId}:${userId}` -> epoch ms

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 25;
const MEDALS = ["🥇", "🥈", "🥉"];

// 1-based position → medal for the podium, otherwise a padded "#N" tag.
function rankPrefix(position: number): string {
  return MEDALS[position - 1] ?? `\`#${position}\``;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export const command: SubCommand = {
  data: new SlashCommandSubcommandBuilder()
    .setName("rank")
    .setDescription("Show Hackerika's affection ranking for this server's members")
    .addIntegerOption((option) =>
      option
        .setName("limit")
        .setDescription(`How many top members to show (default ${DEFAULT_LIMIT}, max ${MAX_LIMIT})`)
        .setMinValue(1)
        .setMaxValue(MAX_LIMIT)
        .setRequired(false)
    ),
  async execute(interaction, _client) {
    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply({
        content: "❌ Command ini cuma bisa dipakai di dalam server.",
        flags: ["Ephemeral"],
      });
      return;
    }

    // Per-user cooldown — checked BEFORE defer so spam gets a cheap ephemeral
    // bounce instead of forcing the member-resolution fan-out.
    const cooldownKey = `${guild.id}:${interaction.user.id}`;
    const now = Date.now();
    const remainingMs = COOLDOWN_MS - (now - (lastUsedAt.get(cooldownKey) ?? 0));
    if (remainingMs > 0) {
      await interaction.reply({
        content: `⏳ Sabar dulu, coba lagi ${Math.ceil(remainingMs / 1000)} detik lagi ya.`,
        flags: ["Ephemeral"],
      });
      return;
    }
    lastUsedAt.set(cooldownKey, now);

    const limit = interaction.options.getInteger("limit") ?? DEFAULT_LIMIT;

    // Public leaderboard → non-ephemeral defer. Member resolution + DB read take
    // a beat, and the board is meant to be seen by the whole channel.
    await interaction.deferReply();

    // Warmest profiles first. `affection > 0` hides the neutral/negative tail:
    // brand-new profiles sit at the 0 default and cooled relationships go
    // negative, so the board only surfaces people Hackerika actually warmed to.
    // The secondary/tertiary sort keys give a deterministic total order (affection
    // is a small integer → ties are common; userId is unique → fully stable), so
    // podium/medals and the requester's rank don't shuffle between runs.
    const candidates = await UserProfileModel.find({ affection: { $gt: 0 } })
      .sort({ affection: -1, lastInteractionAt: -1, userId: 1 })
      .limit(CANDIDATE_CAP)
      .select("userId affection")
      .lean();
    const capHit = candidates.length === CANDIDATE_CAP;

    // Resolve which candidates belong to THIS guild. Cache-first (mirrors
    // Services/AI/mentions.ts) — a warm cache needs zero gateway traffic, and the
    // warmest/most-active users are the ones most likely already cached. Only the
    // uncached remainder is gateway-fetched, in concurrent ≤100-ID batches with a
    // short timeout. Bots are excluded: the board relies on the upstream bot guard
    // in client.ts today, this is belt-and-suspenders for any future non-message
    // affection writer (reactions, seed/admin tooling).
    const memberIds = new Set<string>();
    const unresolved: string[] = [];
    for (const c of candidates) {
      const cached = guild.members.cache.get(c.userId);
      if (cached) {
        if (!cached.user.bot) memberIds.add(c.userId);
      } else {
        unresolved.push(c.userId);
      }
    }
    if (unresolved.length > 0) {
      const results = await Promise.allSettled(
        chunk(unresolved, MEMBER_FETCH_BATCH).map((batch) =>
          guild.members.fetch({ user: batch, time: MEMBER_FETCH_TIMEOUT_MS })
        )
      );
      for (const r of results) {
        if (r.status === "fulfilled") {
          for (const m of r.value.values()) {
            if (!m.user.bot) memberIds.add(m.id);
          }
        } else {
          // Non-member IDs are NOT errors — the gateway returns them in not_found
          // and they're simply absent from the resolved Collection. This only
          // fires on a genuine fetch failure (GuildMembersTimeout / shard send
          // error); log it and keep whatever other batches resolved.
          console.error("[affection rank] member batch fetch failed:", r.reason);
        }
      }
    }
    // The requester invoked this in THIS guild, so they're provably a member —
    // guarantee they're counted even if their membership batch above failed.
    memberIds.add(interaction.user.id);

    const ranked = candidates.filter((c) => memberIds.has(c.userId));

    const embed = new EmbedBuilder()
      .setColor("#ff6b9d")
      .setTitle("💗 Papan Afeksi Hackerika")
      .setTimestamp();

    if (ranked.length === 0) {
      embed.setDescription(
        "Belum ada member di server ini yang affection-nya di atas 0.\n" +
          "Ngobrol dulu sama aku biar ada yang naik 😼"
      );
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const top = ranked.slice(0, limit);
    const lines = top.map(
      (c, idx) => `${rankPrefix(idx + 1)} <@${c.userId}> — **${c.affection}**/100`
    );

    // Requester's own standing. If they're ON the board their score is already
    // public there, so append it to the public embed. If they're NOT on the board
    // (affection ≤ 0 or no profile), that value is part of the deliberately-hidden
    // tail — deliver it privately via an ephemeral follow-up so a public
    // invocation doesn't broadcast the requester's own cold standing to the room.
    const requesterId = interaction.user.id;
    const ownIndex = ranked.findIndex((c) => c.userId === requesterId);
    let privateOwnLine: string | null = null;
    if (ownIndex >= 0) {
      lines.push("");
      lines.push(
        `👉 Kamu: **#${ownIndex + 1}** dari ${ranked.length} — **${ranked[ownIndex].affection}**/100`
      );
    } else {
      const own = await UserProfileModel.findOne({ userId: requesterId })
        .select("affection")
        .lean();
      const aff = (own as { affection?: number } | null)?.affection;
      privateOwnLine =
        typeof aff === "number"
          ? `Kamu belum masuk papan ini (affection kamu: **${aff}**/100). Ngobrol lagi sama aku biar naik 😼`
          : "Kamu belum punya profil — ayo ngobrol dulu sama aku 😼";
    }

    embed.setDescription(lines.join("\n"));
    const footerBits = [`Top ${top.length} dari ${ranked.length} member`];
    if (capHit) footerBits.push("papan mungkin belum lengkap");
    footerBits.push("skor afeksi tumbuh organik, ga bisa di-farm 😼");
    embed.setFooter({ text: footerBits.join(" • ") });

    await interaction.editReply({ embeds: [embed] });
    if (privateOwnLine) {
      await interaction.followUp({ content: privateOwnLine, flags: ["Ephemeral"] });
    }
  },
};
