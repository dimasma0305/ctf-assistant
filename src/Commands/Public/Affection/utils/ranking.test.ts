import { afterEach, expect, mock, spyOn, test } from 'bun:test';
import { Collection } from 'discord.js';
import { UserProfileModel, SocialStateModel } from '../../../../Database/connect';
import { command as rankCommand } from '../rank';
import { command as rankingCommand } from '../ranking';
import { buildRankingEmbeds, formatRankingMetrics, rankingEntries, sortRanking, RANKING_METRICS } from './ranking';

afterEach(() => mock.restore());
const now = new Date('2026-10-16T12:00:00Z');
const profile = (userId: string, extra = {}) => ({ userId, affection: 0, previousAffection: 0, trust: 0, respect: 0,
  comfort: 0, chemistry: 0, interactionCount: 1, lastInteractionAt: now, ...extra });

test('trust ranking includes a trusted person with cold affection and sorts deterministic ties', () => {
  const entries = rankingEntries([profile('300', { affection: 90, trust: 5 }),
    profile('200', { affection: -8, trust: 80 }), profile('100', { trust: 80 }), profile('400', { trust: 0 })], [], now);
  expect(sortRanking(entries, 'trust').map(entry => entry.userId)).toEqual(['100', '200', '300']);
  expect(sortRanking(entries, 'affection').map(entry => entry.userId)).toEqual(['300']);
  expect(entries.map(entry => entry.userId)).toEqual(['300', '200', '100', '400']);
});

test('emotions use elapsed-time decay, and affection change retains negative history', () => {
  const [entry] = rankingEntries([profile('user', { affection: -5, previousAffection: -10,
    interactionCount: 42, lastDistilledAtCount: 39 })],
    [{ userId: 'user', anger: 48, hurt: 30, warmth: 60, updatedAt: new Date(now.getTime() - 2 * 3_600_000) }], now);
  expect(entry.metrics).toEqual({ affection: -5, trust: 0, respect: 0, comfort: 0, chemistry: 0,
    anger: 24, hurt: 18, warmth: 56, change: 5, interactions: 42 });
  expect(formatRankingMetrics(entry)).toContain('Δ +5');
  expect(formatRankingMetrics(entry)).toContain('evaluasi 3/5');
  const [late] = rankingEntries([profile('late', { interactionCount: 50, lastDistilledAtCount: 40 })], [], now);
  expect(formatRankingMetrics(late)).toContain('evaluasi tertunda');
  const [fractional] = rankingEntries([profile('fractional')], [{ userId: 'fractional', anger: 42.4, hurt: 30.6, warmth: 60.4,
    updatedAt: new Date(now.getTime() - 0.4 * 3_600_000) }], now);
  expect(fractional.metrics.anger).toBe(38);
  expect(fractional.metrics.hurt).toBe(28);
  expect(fractional.metrics.warmth).toBe(60);
});

test('legacy profiles have numeric defaults and formatting excludes all private/free-form fields', () => {
  const [entry] = rankingEntries([{ userId: 'legacy', opinion: 'PRIVATE_OPINION', moments: ['PRIVATE_MEMORY'] }],
    [{ userId: 'legacy', reason: 'PRIVATE_REASON', handoff: { openingMessage: 'PRIVATE_DM' } }], now);
  expect(entry.metrics).toEqual({ affection: 0, trust: 0, respect: 0, comfort: 0, chemistry: 0,
    warmth: 20, anger: 0, hurt: 0, interactions: 0, change: 0 });
  expect(formatRankingMetrics(entry)).not.toContain('PRIVATE');
});

test('ranking distinguishes unchanged evaluations, changed evaluations, and failed attempts', () => {
  for (const [status, label] of [['unchanged', 'evaluasi: tetap'], ['changed', 'evaluasi: berubah'], ['failed', 'evaluasi gagal']]) {
    const [entry] = rankingEntries([profile('user', { interactionCount: 10, lastDistilledAtCount: status === 'failed' ? 5 : 10,
      lastRelationshipEvaluationStatus: status, lastRelationshipEvaluationReason: 'PRIVATE_AUDIT_NOTE' })], [], now);
    expect(formatRankingMetrics(entry)).toContain(label);
    expect(formatRankingMetrics(entry)).not.toContain('PRIVATE_AUDIT_NOTE');
    expect(entry.pendingEvaluation).toBe(status === 'failed' ? 5 : 0);
  }
});

test('25 maximal rows plus requester metrics fit Discord description and shared embed limits', () => {
  const profiles = Array.from({ length: 26 }, (_, i) => profile(String(90000000000000000000n + BigInt(i)),
    { affection: 100, previousAffection: -100, trust: -100, respect: -100, comfort: -100, chemistry: -100, interactionCount: Number.MAX_SAFE_INTEGER }));
  const states = profiles.map(p => ({ userId: p.userId, anger: 100, hurt: 100, warmth: 100, updatedAt: now }));
  const entries = rankingEntries(profiles, states, now);
  for (const metric of RANKING_METRICS.map(item => item.value)) {
    const ranked = sortRanking(entries, metric);
    const embeds = buildRankingEmbeds(ranked, metric, 25, profiles[25].userId, true).map(embed => embed.toJSON());
    expect(embeds.length).toBeLessThanOrEqual(10);
    expect(embeds.every(embed => (embed.description?.length || 0) <= 4096)).toBe(true);
    expect(embeds.reduce((sum, embed) => sum + (embed.description?.length || 0) + (embed.title?.length || 0) + (embed.footer?.text.length || 0), 0)).toBeLessThanOrEqual(6000);
    expect(embeds.at(-1)?.footer?.text).toContain('data belum lengkap');
  }
  expect(buildRankingEmbeds(sortRanking(entries, 'anger'), 'anger', 25, profiles[25].userId, false)[0].toJSON().description).toContain('bukan lebih dekat');
});

test('both command names expose the same ten sortable metrics', () => {
  const a = rankCommand.data.toJSON(), b = rankingCommand.data.toJSON();
  expect(a.name).toBe('rank'); expect(b.name).toBe('ranking');
  expect(a.options).toEqual(b.options);
  expect((a.options?.find(option => option.name === 'metric') as any).choices).toHaveLength(10);
});

function fakeInteraction(id: string, metric: string, cached: any[] = []) {
  const calls = { edits: [] as any[], private: [] as any[], replies: [] as any[], fetches: [] as any[] };
  return { calls, interaction: { guild: { id, members: { cache: new Collection(cached.map(member => [member.id, member])),
    fetch: async (options: any) => { calls.fetches.push(options); return new Collection(); } } },
    user: { id: 'self' }, options: { getInteger: () => 10, getString: () => metric },
    deferReply: async () => {}, editReply: async (payload: any) => { calls.edits.push(payload); },
    followUp: async (payload: any) => { calls.private.push(payload); }, reply: async (payload: any) => { calls.replies.push(payload); },
  } as any };
}
function fakeQuery(value: any, projections: string[]) {
  return { sort() { return this; }, limit() { return this; }, select(fields: string) { projections.push(fields); return this; }, lean: async () => value } as any;
}

test('command keeps outsiders/bots off a trust board and only selects numeric social fields', async () => {
  const projections: string[] = []; let socialIds: string[] = [];
  spyOn(UserProfileModel, 'find').mockImplementation(() => fakeQuery([
    profile('self', { affection: -5, trust: 8 }), profile('friend', { trust: 90 }),
    profile('outsider', { trust: 100 }), profile('bot', { trust: 100 }),
  ], projections));
  spyOn(SocialStateModel, 'find').mockImplementation((filter: any = {}) => { socialIds = filter.userId.$in; return fakeQuery([], projections); });
  const write = spyOn(UserProfileModel, 'updateOne').mockRejectedValue(new Error('Ranking must be read-only'));
  const member = (id: string, bot = false) => ({ id, user: { bot } });
  const { interaction, calls } = fakeInteraction('trust-guild', 'trust', [member('friend'), member('bot', true)]);
  await rankingCommand.execute!(interaction, {} as any);
  const visible = calls.edits[0].embeds.map((embed: any) => embed.toJSON().description).join('\n');
  expect(visible).toContain('<@friend>'); expect(visible).toContain('<@self>');
  expect(visible.indexOf('<@friend>')).toBeLessThan(visible.indexOf('<@self>'));
  expect(visible).toContain('Afeksi -5'); expect(visible).toContain('Chemistry 0'); expect(visible).toContain('Warmth 20');
  expect(visible).not.toContain('<@outsider>'); expect(visible).not.toContain('<@bot>');
  expect(socialIds.sort()).toEqual(['friend', 'self']);
  expect(projections).toContain('userId anger hurt warmth updatedAt');
  expect(projections.join(' ')).not.toMatch(/handoff|reason|opinion|moments/);
  expect(calls.private).toHaveLength(0); expect(write).not.toHaveBeenCalled();
});

test('an empty board still sends all requester metrics privately and aliases share cooldown', async () => {
  const projections: string[] = [];
  spyOn(UserProfileModel, 'find').mockImplementation(() => fakeQuery([profile('self', { affection: -4, trust: -2, interactionCount: 12 })], projections));
  spyOn(SocialStateModel, 'find').mockImplementation(() => fakeQuery([], projections));
  const { interaction, calls } = fakeInteraction('empty-guild', 'affection');
  await rankCommand.execute!(interaction, {} as any);
  expect(calls.edits[0].embeds[0].toJSON().description).toContain('Belum ada member');
  expect(calls.edits[0].embeds[0].toJSON().description).not.toContain('Afeksi -4');
  expect(calls.private[0].flags).toEqual(['Ephemeral']);
  expect(calls.private[0].content).toContain('Afeksi -4');
  expect(calls.private[0].content).toContain('Trust -2');
  expect(calls.private[0].content).toContain('Interaksi 12');
  await rankingCommand.execute!(interaction, {} as any);
  expect(calls.edits).toHaveLength(1); expect(calls.replies[0].flags).toEqual(['Ephemeral']);
});

test('member resolution is batched at 100 IDs with a bounded timeout', async () => {
  const projections: string[] = [];
  spyOn(UserProfileModel, 'find').mockImplementation(() => fakeQuery(Array.from({ length: 201 }, (_, i) => profile(`member-${i}`, { affection: 1 })), projections));
  spyOn(UserProfileModel, 'findOne').mockImplementation(() => fakeQuery(null, projections));
  const { interaction, calls } = fakeInteraction('batch-guild', 'affection');
  await rankCommand.execute!(interaction, {} as any);
  expect(calls.fetches.map(options => options.user.length)).toEqual([100, 100, 1]);
  expect(calls.fetches.every(options => options.time === 10_000)).toBe(true);
});
