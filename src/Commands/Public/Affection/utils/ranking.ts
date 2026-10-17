import { EmbedBuilder, SlashCommandSubcommandBuilder } from 'discord.js';
import type { SubCommand } from '../../../../Model/command';
import { SocialStateModel, UserProfileModel } from '../../../../Database/connect';
import { newSocialState, settleSocialState } from '../../../../Services/AI/socialState';

export const RANKING_METRICS = [
  { value: 'affection', name: 'Afeksi' },
  { value: 'trust', name: 'Trust (kepercayaan)' },
  { value: 'respect', name: 'Respect (respek)' },
  { value: 'comfort', name: 'Comfort (kenyamanan)' },
  { value: 'chemistry', name: 'Chemistry (kecocokan)' },
  { value: 'warmth', name: 'Warmth (kehangatan saat ini)' },
  { value: 'anger', name: 'Anger (kemarahan saat ini)' },
  { value: 'hurt', name: 'Hurt (rasa terluka saat ini)' },
  { value: 'interactions', name: 'Jumlah interaksi' },
  { value: 'change', name: 'Perubahan afeksi terakhir' },
] as const;
export type RankingMetric = typeof RANKING_METRICS[number]['value'];
type Metrics = Record<RankingMetric, number>;
export interface RankingEntry { userId: string; metrics: Metrics; lastInteractionAt: number }

// Profiles are global. Resolve membership after this bounded candidate read;
// hitting the cap or a failed member batch makes the board explicitly partial.
const CANDIDATE_CAP = 500;
const MEMBER_FETCH_BATCH = 100;
const MEMBER_FETCH_TIMEOUT_MS = 10_000;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 25;
const COOLDOWN_MS = 15_000;
const lastUsedAt = new Map<string, number>(); // Shared by rank and ranking aliases.
const PROFILE_FIELDS = 'userId affection previousAffection trust respect comfort chemistry interactionCount lastInteractionAt';
const SOCIAL_FIELDS = 'userId anger hurt warmth updatedAt'; // No DM content or reasons.
const inRange = (value: unknown, min: number, max: number, fallback = 0) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
const bounded = (value: unknown, min: number, max: number, fallback = 0) => Math.round(inRange(value, min, max, fallback));
const timestamp = (value: unknown, fallback = 0) => {
  const n = value ? new Date(value as string).getTime() : NaN;
  return Number.isFinite(n) ? n : fallback;
};
const delta = (n: number) => n > 0 ? `+${n}` : String(n);
const label = (metric: RankingMetric) => RANKING_METRICS.find(item => item.value === metric)!.name;

export function rankingEntries(profiles: any[], socialStates: any[], now = new Date()): RankingEntry[] {
  const social = new Map(socialStates.map(state => [state.userId, state]));
  return profiles.map(profile => {
    const stored = social.get(profile.userId);
    const state = settleSocialState({ ...newSocialState(profile.userId, now),
      anger: inRange(stored?.anger, 0, 100), hurt: inRange(stored?.hurt, 0, 100),
      warmth: inRange(stored?.warmth, 0, 100, 20),
      updatedAt: new Date(timestamp(stored?.updatedAt, now.getTime())),
    }, now);
    const affection = bounded(profile.affection, -100, 100);
    return { userId: profile.userId, lastInteractionAt: timestamp(profile.lastInteractionAt), metrics: {
      affection, trust: bounded(profile.trust, -100, 100), respect: bounded(profile.respect, -100, 100),
      comfort: bounded(profile.comfort, -100, 100), chemistry: bounded(profile.chemistry, -100, 100),
      warmth: Math.round(state.warmth), anger: Math.round(state.anger), hurt: Math.round(state.hurt),
      interactions: bounded(profile.interactionCount, 0, Number.MAX_SAFE_INTEGER),
      change: affection - bounded(profile.previousAffection, -100, 100),
    } };
  });
}

export function sortRanking(entries: RankingEntry[], metric: RankingMetric): RankingEntry[] {
  return entries.filter(entry => entry.metrics[metric] > 0).sort((a, b) =>
    b.metrics[metric] - a.metrics[metric] || b.lastInteractionAt - a.lastInteractionAt || a.userId.localeCompare(b.userId));
}

export function formatRankingMetrics(entry: RankingEntry): string {
  const m = entry.metrics;
  return `Afeksi ${m.affection} · Trust ${m.trust} · Respect ${m.respect} · Comfort ${m.comfort} · Chemistry ${m.chemistry}\n` +
    `Warmth ${m.warmth} · Anger ${m.anger} · Hurt ${m.hurt} · Δ ${delta(m.change)} · Interaksi ${m.interactions}`;
}

export function buildRankingEmbeds(ranked: RankingEntry[], metric: RankingMetric, limit: number,
  requesterId: string, partial: boolean): EmbedBuilder[] {
  const top = ranked.slice(0, limit);
  const range = 'Hubungan −100..100; emosi 0..100. Δ = perubahan afeksi sejak evaluasi terakhir.';
  const meaning = metric === 'anger' || metric === 'hurt' ? '\nSkor ini tinggi berarti lebih marah/terluka, bukan lebih dekat.' : '';
  const heading = `Diurutkan menurut **${label(metric)}**, tertinggi dulu.\n${range}${meaning}`;
  const rows = top.map((entry, index) => {
    const position = ['🥇', '🥈', '🥉'][index] || `\`#${index + 1}\``;
    const score = metric === 'change' ? delta(entry.metrics[metric]) : entry.metrics[metric];
    return `${position} <@${entry.userId}> — **${score}**\n${formatRankingMetrics(entry)}`;
  });
  if (!rows.length) rows.push(`Belum ada member dengan skor ${label(metric)} di atas 0.\nCoba pilih metrik lain atau ngobrol dulu sama aku 😼`);
  const ownIndex = ranked.findIndex(entry => entry.userId === requesterId);
  if (ownIndex >= 0) rows.push(`👉 Kamu: **#${ownIndex + 1}** dari ${ranked.length}\n${formatRankingMetrics(ranked[ownIndex])}`);

  // Keep every row intact, under the per-description and shared embed budgets.
  // Numeric-only rows (at most 25) keep the total below 6000 characters.
  const descriptions: string[] = [];
  let current = heading;
  for (const row of rows) {
    if (current.length + row.length + 2 > 3800) { descriptions.push(current); current = row; }
    else current += `\n\n${row}`;
  }
  descriptions.push(current);
  const footer = `Top ${top.length} dari ${ranked.length} member${partial ? ' • data belum lengkap' : ''} • emosi mereda seiring waktu`;
  return descriptions.map((description, index) => {
    const embed = new EmbedBuilder().setColor('#ff6b9d')
      .setTitle(index ? '💗 Papan Hubungan Hackerika — lanjutan' : '💗 Papan Hubungan Hackerika')
      .setDescription(description);
    if (index === descriptions.length - 1) embed.setFooter({ text: footer }).setTimestamp();
    return embed;
  });
}

export function buildRankingCommand(name: 'rank' | 'ranking'): SubCommand {
  return {
    data: new SlashCommandSubcommandBuilder().setName(name)
      .setDescription('Lihat seluruh metrik hubungan Hackerika dan pilih urutan ranking')
      .addStringOption(option => option.setName('metric').setDescription('Urutkan berdasarkan metrik ini (default: afeksi)')
        .addChoices(...RANKING_METRICS).setRequired(false))
      .addIntegerOption(option => option.setName('limit').setDescription(`Jumlah member (default ${DEFAULT_LIMIT}, maks ${MAX_LIMIT})`)
        .setMinValue(1).setMaxValue(MAX_LIMIT).setRequired(false)),
    async execute(interaction) {
      const guild = interaction.guild;
      if (!guild) { await interaction.reply({ content: '❌ Command ini cuma bisa dipakai di dalam server.', flags: ['Ephemeral'] }); return; }
      const key = `${guild.id}:${interaction.user.id}`;
      const now = Date.now();
      const remaining = COOLDOWN_MS - (now - (lastUsedAt.get(key) ?? 0));
      if (remaining > 0) { await interaction.reply({ content: `⏳ Sabar dulu, coba lagi ${Math.ceil(remaining / 1000)} detik lagi ya.`, flags: ['Ephemeral'] }); return; }
      // Expired cooldowns do not need to accumulate for departed users/guilds.
      for (const [storedKey, usedAt] of lastUsedAt) if (now - usedAt >= COOLDOWN_MS) lastUsedAt.delete(storedKey);
      lastUsedAt.set(key, now);
      const chosen = interaction.options.getString('metric');
      const metric: RankingMetric = RANKING_METRICS.find(item => item.value === chosen)?.value || 'affection';
      const limit = interaction.options.getInteger('limit') ?? DEFAULT_LIMIT;
      await interaction.deferReply();

      const profileMetric = metric === 'interactions' ? 'interactionCount'
        : ['affection', 'trust', 'respect', 'comfort', 'chemistry'].includes(metric) ? metric : null;
      const sort = profileMetric ? { [profileMetric]: -1, lastInteractionAt: -1, userId: 1 } : { lastInteractionAt: -1, userId: 1 };
      const profiles = await UserProfileModel.find({}).sort(sort as any).limit(CANDIDATE_CAP).select(PROFILE_FIELDS).lean();
      let partial = profiles.length === CANDIDATE_CAP;
      const memberIds = new Set<string>([interaction.user.id]);
      const unresolved: string[] = [];
      for (const profile of profiles) {
        const cached = guild.members.cache.get(profile.userId);
        if (cached) { if (!cached.user.bot) memberIds.add(profile.userId); }
        else unresolved.push(profile.userId);
      }
      const batches: string[][] = [];
      for (let i = 0; i < unresolved.length; i += MEMBER_FETCH_BATCH) batches.push(unresolved.slice(i, i + MEMBER_FETCH_BATCH));
      const resolved = await Promise.allSettled(batches.map(batch => guild.members.fetch({ user: batch, time: MEMBER_FETCH_TIMEOUT_MS })));
      for (const result of resolved) {
        if (result.status === 'fulfilled') {
          for (const member of result.value.values()) if (!member.user.bot) memberIds.add(member.id);
        } else {
          partial = true;
          console.warn('[affection ranking] member resolution incomplete');
        }
      }
      const members = profiles.filter(profile => memberIds.has(profile.userId));
      const own = profiles.find(profile => profile.userId === interaction.user.id)
        || await UserProfileModel.findOne({ userId: interaction.user.id }).select(PROFILE_FIELDS).lean();
      // Read only this guild's numeric state, including a requester outside the cap.
      const stateIds = [...new Set([...members.map(profile => profile.userId), ...(own ? [interaction.user.id] : [])])];
      const states = stateIds.length ? await SocialStateModel.find({ userId: { $in: stateIds } }).select(SOCIAL_FIELDS).lean() : [];
      const entries = rankingEntries(members, states, new Date(now));
      const ranked = sortRanking(entries, metric);
      await interaction.editReply({ embeds: buildRankingEmbeds(ranked, metric, limit, interaction.user.id, partial), allowedMentions: { parse: [] } });
      if (!ranked.some(entry => entry.userId === interaction.user.id)) {
        const ownEntry = own && rankingEntries([own], states, new Date(now))[0];
        const content = ownEntry ? `Kamu belum masuk daftar untuk metrik ${label(metric)}.\n${formatRankingMetrics(ownEntry)}`
          : 'Kamu belum punya profil — ayo ngobrol dulu sama aku 😼';
        await interaction.followUp({ content, flags: ['Ephemeral'], allowedMentions: { parse: [] } });
      }
    },
  };
}
