import { expect, test } from 'bun:test';
import { Collection } from 'discord.js';
import { discordPersonResearchSubject, discordProfileSubject, getDiscordProfileForTool, type DiscordProfile } from './discordProfile';
import { discordProfileSearchQueries, formatDiscordProfileReply, groundResearchReply, requiresResearch } from './research';

const speaker = '663394727688798231';
const bot = '1077393568647352320';
const target = '795513549812006981';
const other = '795513549812006982';

function fixture(content: string) {
  const calls: string[] = [];
  const user = { id: target, username: 'ammarspaces', globalName: 'FindFemaleBot', bot: false,
    email: 'must-never-appear@example.test', createdAt: new Date('2021-01-01T00:00:00Z'),
    avatarURL: () => 'https://cdn.discordapp.com/avatars/avatar.png', bannerURL: () => null,
    flags: { toArray: () => ['ActiveDeveloper'] } };
  const member = { id: target, displayName: 'FindFemaleBot', nickname: 'FindFemaleBot',
    joinedAt: new Date('2026-08-01T00:00:00Z'), avatarURL: () => null, bannerURL: () => null,
    roles: { cache: new Collection([['555555555555555555', { id: '555555555555555555', name: '@everyone', position: 0 }],
      ['role', { id: 'role', name: 'CTF Player', position: 2 }]]) } };
  const message = { content, author: { id: speaker },
    client: { user: { id: bot }, users: { fetch: async (id: string) => { calls.push(`user:${id}`); return user; } } },
    guild: { id: '555555555555555555', members: { fetch: async (id: string) => { calls.push(`member:${id}`); return member; } } } };
  return { message, calls, member, user };
}

test('Discord profile uses exactly the other explicit mention, including when Hackerika is mentioned first', async () => {
  const { message, calls } = fixture(`<@${bot}> deep search dan osint siapa itu <@${target}>`);
  expect(discordProfileSubject(message as unknown as Parameters<typeof discordProfileSubject>[0])).toBe(target);
  const result = await getDiscordProfileForTool(message as unknown as Parameters<typeof getDiscordProfileForTool>[0]);
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(calls).toEqual([`member:${target}`, `user:${target}`]);
  expect(result.profile).toMatchObject({ id: target, username: 'ammarspaces', globalName: 'FindFemaleBot',
    accountCreatedAtBasis: 'discord_snowflake', guild: { joinedAt: '2026-08-01T00:00:00.000Z', roles: ['CTF Player'] } });
  expect(JSON.stringify(result)).not.toContain('must-never-appear');
});

test('profile lookup does not inspect an unmentioned third party or ambiguous multiple targets', async () => {
  const one = fixture(`<@${bot}> cek <@${target}>`);
  expect(await getDiscordProfileForTool(one.message as unknown as Parameters<typeof getDiscordProfileForTool>[0], { userId: other })).toMatchObject({ ok: false });
  expect(one.calls).toEqual([]);
  const many = fixture(`<@${bot}> cek <@${target}> dan <@${other}>`);
  expect(discordProfileSubject(many.message as unknown as Parameters<typeof discordProfileSubject>[0])).toBe(null);
  expect(await getDiscordProfileForTool(many.message as unknown as Parameters<typeof getDiscordProfileForTool>[0])).toMatchObject({ ok: false });
  expect(many.calls).toEqual([]);
  const self = fixture('Rika, cek profilku dong');
  expect(discordProfileSubject(self.message as unknown as Parameters<typeof discordProfileSubject>[0])).toBe(speaker);
});

test('natural siapa @member deep search request selects one profile, not generic CTF mentions', () => {
  const direct = fixture(`<@${bot}> siapa <@${target}> aku mau kamu deep search dia`);
  const prior = fixture(`<@${bot}> deep search dan osint siapa itu <@${target}>`);
  const ctf = fixture(`<@${bot}> sebutkan 10 dosa besar <@${target}>`);
  const ambiguous = fixture(`<@${bot}> siapa <@${target}> dan <@${other}>`);
  for (const value of [direct, prior])
    expect(discordPersonResearchSubject(value.message as unknown as Parameters<typeof discordPersonResearchSubject>[0])).toBe(target);
  for (const value of [ctf, ambiguous])
    expect(discordPersonResearchSubject(value.message as unknown as Parameters<typeof discordPersonResearchSubject>[0])).toBe(null);
});

test('a failed global-user refresh still uses the freshly fetched guild member user', async () => {
  const { message, member, user } = fixture(`cek profil <@${target}>`);
  const fallback = { ...member, user };
  message.guild.members.fetch = async () => fallback;
  message.client.users.fetch = async () => { throw new Error('Discord user endpoint unavailable'); };
  const result = await getDiscordProfileForTool(message as unknown as Parameters<typeof getDiscordProfileForTool>[0]);
  expect(result.ok).toBe(true);
  if (result.ok) expect(result.profile.username).toBe('ammarspaces');
});

test('deep Discord OSINT is routed to research and never attributes a same-name web page', () => {
  expect(requiresResearch(`<@${bot}> deep search dan osint siapa itu <@${target}>`)).toBe(true);
  const profile: DiscordProfile = { id: target, username: 'ammarspaces', globalName: 'FindFemaleBot', bot: false,
    accountCreatedAt: '2021-01-01T00:00:00.000Z', accountCreatedAtBasis: 'discord_snowflake',
    avatarUrl: null, bannerUrl: null, publicFlags: [],
    guild: { id: '555555555555555555', displayName: 'FindFemaleBot', nickname: null,
      joinedAt: '2026-08-01T00:00:00.000Z', roles: ['CTF Player'], avatarUrl: null, bannerUrl: null } };
  const report: NonNullable<Parameters<typeof groundResearchReply>[1]> = { ok: false, status: 'partial', question: 'Who?', discordProfile: profile,
    findings: [{ claim: 'HackerDNA ammarspaces adalah FindFemaleBot.', evidence: [{ sourceId: 'S1', quote: 'ammarspaces' }] }],
    sources: [{ id: 'S1', kind: 'page', url: 'https://example.com/ammarspaces', title: 'ammarspaces', preview: 'ammarspaces' }],
    unresolved: [], stats: { model: 'fixture', modelCalls: 1, actions: 1, nativeSearches: 1,
      elapsedMs: 1, promptTokens: 1, completionTokens: 1 } };
  const answer = groundResearchReply('HackerDNA ammarspaces adalah FindFemaleBot.', report);
  expect(answer).toContain('Yang bisa kupastikan dari Discord');
  expect(answer).toContain('@ammarspaces');
  expect(answer).not.toContain('HackerDNA');
  expect(answer).toContain('belum membuktikan');
  expect(answer).toContain('[example.com/ammarspaces](https://example.com/ammarspaces)');
  expect(formatDiscordProfileReply(profile)).toContain('belum menemukan halaman publik');
  expect(discordProfileSearchQueries(profile)).toEqual(['"ammarspaces"', '"FindFemaleBot"']);
});

test('profile grounding shows multiple inspected leads without attributing them to the member', () => {
  const profile: DiscordProfile = { id: target, username: 'worldsavior', globalName: 'Aryma House Of Wolf', bot: false,
    accountCreatedAt: '2021-01-01T00:00:00.000Z', accountCreatedAtBasis: 'discord_snowflake', avatarUrl: null,
    bannerUrl: null, publicFlags: [], guild: { id: '555555555555555555', displayName: 'Aryma House Of Wolf', nickname: null,
      joinedAt: '2026-08-01T00:00:00.000Z', roles: [], avatarUrl: null, bannerUrl: null } };
  const report: NonNullable<Parameters<typeof groundResearchReply>[1]> = { ok: false, status: 'partial', question: 'Who?',
    discordProfile: profile, findings: [], unresolved: [], sources: [
      { id: 'S1', kind: 'page', url: 'https://example.com/worldsavior', title: 'worldsavior', preview: 'worldsavior' },
      { id: 'S2', kind: 'page', url: 'https://example.com/aryma', title: 'Aryma', preview: 'Aryma' },
      { id: 'S3', kind: 'search', url: 'https://example.com/not-read', title: 'Aryma', preview: 'Aryma' }],
    stats: { model: 'fixture', modelCalls: 1, actions: 1, nativeSearches: 1, elapsedMs: 1, promptTokens: 1, completionTokens: 1 } };
  const answer = groundResearchReply('', report);
  expect(answer).toContain('https://example.com/worldsavior');
  expect(answer).toContain('https://example.com/aryma');
  expect(answer).not.toContain('https://example.com/not-read');
  expect(answer).toContain('belum membuktikan');
  expect(discordProfileSearchQueries(profile)).toEqual(['"worldsavior"', '"Aryma House Of Wolf"']);
});
