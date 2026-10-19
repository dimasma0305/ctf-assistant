import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { openai } from '../../src/utils/openai';
import { MODELS } from '../../src/Services/AI/models';
import { buildHackerikaSystemPrompt } from '../../src/Services/AI/persona';
import { TOOL_DEFINITIONS } from '../../src/Services/AI/tools';
import { requiresCTFSolve, ctfToolAvailable } from '../../src/Services/AI/ctf';
import { requiresResearch } from '../../src/Services/AI/research';

const botId = '800000000000000001', memberId = '800000000000000002';
const cases = [
  { id: 'casual', text: `<@${botId}> wkwk tadi lucu banget`, expected: ['none', 'finish_turn', 'react_to_message'] },
  { id: 'ctf_definition', text: `<@${botId}> CTF itu apa sih?`, expected: ['none'] },
  { id: 'puzzle_without_ctf_keyword', text: `<@${botId}> bantu pecahkan file ELF dan cari string rahasianya, ada binary aslinya di lampiran`, expected: ['delegate_codex:ctf'] },
  { id: 'explicit_challenge', text: `<@${botId}> solve challenge wordpress ini dari source dan attachment thread sampai ketemu flag`, expected: ['delegate_codex:ctf'] },
  { id: 'simple_public_lookup', text: `<@${botId}> cek versi terbaru Bun saat ini dari dokumentasi resminya`, expected: ['web_search', 'research_topic'] },
  { id: 'multi_source_research', text: `<@${botId}> bandingkan implementasi first blood dan webhook di https://github.com/otter-sec/rctf https://github.com/dimasma0305/rsctf dan https://github.com/CTFd/CTFd. baca konfigurasi dan kode, bukan README doang, lalu kasih tabel sumbernya`, expected: ['delegate_codex:investigation', 'research_topic'] },
  { id: 'profile_deep_research', text: `<@${botId}> deep search profil CTF publik <@${memberId}>: cek tautan akun yang dia klaim sendiri dan karya teknisnya, bedakan yang belum terverifikasi`, expected: ['delegate_codex:investigation', 'get_discord_profile', 'research_topic'] },
  { id: 'shallow_research_retry', text: `<@${botId}> risetmu tadi tentang https://github.com/dimasma0305/rsctf cuma baca satu halaman lalu jawab "bagian lain perlu dicek". Lanjutkan investigasi kode/docs beberapa sumber, ikuti tautannya, lalu jawab rinci dengan bukti`, expected: ['delegate_codex:investigation'] },
  { id: 'small_calculation', text: `<@${botId}> 17 kali 23 berapa?`, expected: ['none'] },
] as const;
const out = process.argv[process.argv.indexOf('--out') + 1];
if (!out || await Bun.file(`${out}/results.json`).exists()) throw Error('Use --out FRESH_PATH');
await mkdir(out, { recursive: true });
const system = buildHackerikaSystemPrompt(botId, '800000000000000099');
const context = `[trusted Discord context] live-environment: {"guildId":"555555555555555555","channelId":"700000000000000001","channelName":"ctf-chat","isThread":true,"threadCoverage":"available","botCanRead":true,"speakerCanRead":true}. Current message follows.`;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const results: any[] = [];
for (const item of cases) {
  // Frozen pre-change decision policy: the old chat loop forced the first call
  // when either regex returned true. Ambiguous classifier overrides are not
  // included, so this is a policy baseline, not a full old-model replay.
  const ctf = requiresCTFSolve(item.text);
  const research = !ctf && requiresResearch(item.text);
  const legacy = ctf ? 'solve_ctf' : research ? 'research_topic' : 'auto';
  const eligible = ctfToolAvailable(item.text);
  let choice = 'error', followup = '', args: any, toolArgs: any, error = '';
  try {
    const response = await openai.chat.completions.create({ model: MODELS.chat, thinking: { type: 'enabled' }, reasoning_effort: 'low',
      max_tokens: 1300, messages: [{ role: 'system', content: system }, { role: 'user', content: `${context}\n[Discord current message] ${item.text}` }],
      tools: TOOL_DEFINITIONS as any, tool_choice: 'auto', parallel_tool_calls: false } as any,
    { signal: AbortSignal.timeout(50_000), maxRetries: 0 });
    const call: any = response.choices[0]?.message?.tool_calls?.[0];
    choice = call?.function?.name || 'none';
    if (call) { try { toolArgs = JSON.parse(call.function.arguments || '{}'); } catch { /* checked by choice below */ } }
    if (choice === 'delegate_codex') {
      try { args = JSON.parse(call.function.arguments || '{}'); choice += `:${args.kind || 'missing'}`; }
      catch { choice += ':malformed'; }
    }
    if (item.id === 'profile_deep_research' && call?.function?.name === 'get_discord_profile') {
      const profile = { ok: true, source: 'discord_api', profile: { id: memberId, username: 'example_ctfer',
        globalName: 'Example', bot: false, accountCreatedAt: '2024-01-01T00:00:00.000Z', accountCreatedAtBasis: 'discord_snowflake',
        avatarUrl: null, bannerUrl: null, publicFlags: [], guild: { id: '555555555555555555', displayName: 'Example',
          nickname: null, joinedAt: '2025-01-01T00:00:00.000Z', roles: [], avatarUrl: null, bannerUrl: null } },
        limitations: 'No verified web-account link or private identity.' };
      const continued = await openai.chat.completions.create({ model: MODELS.chat, thinking: { type: 'enabled' }, reasoning_effort: 'low',
        max_tokens: 1300, messages: [{ role: 'system', content: system }, { role: 'user', content: `${context}\n[Discord current message] ${item.text}` },
          { ...response.choices[0].message, reasoning_content: (response.choices[0].message as any).reasoning_content || '' },
          { role: 'tool', tool_call_id: call.id, content: JSON.stringify(profile) }],
        tools: TOOL_DEFINITIONS as any, tool_choice: 'auto', parallel_tool_calls: false } as any,
      { signal: AbortSignal.timeout(50_000), maxRetries: 0 });
      const next: any = continued.choices[0]?.message?.tool_calls?.[0];
      followup = next?.function?.name || 'none';
      if (followup === 'delegate_codex') {
        try { followup += `:${JSON.parse(next.function.arguments || '{}').kind || 'missing'}`; }
        catch { followup += ':malformed'; }
      }
    }
  } catch (e: any) { error = String(e?.message || e).slice(0, 180); }
  const profileArgsValid = item.id !== 'profile_deep_research' || choice !== 'research_topic'
    || toolArgs?.targetUserId === memberId && toolArgs?.deep === true;
  const row = { id: item.id, legacy, legacyCtfEligible: eligible, actual: choice, ...(followup ? { followup } : {}), expected: item.expected,
    pass: item.expected.includes(choice as never) && profileArgsValid, ...(toolArgs ? { toolArgs } : {}), ...(error ? { error } : {}) };
  results.push(row);
  await writeFile(`${out}/results.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ id: row.id, legacy, actual: choice, pass: row.pass }));
}
const summary = { samples: results.length, passed: results.filter(row => row.pass).length,
  oldPolicyForced: results.filter(row => row.legacy !== 'auto').length,
  newCodexCalls: results.filter(row => row.actual.startsWith('delegate_codex')).length,
  falseCodexOnSimpleCases: results.filter(row => ['casual', 'ctf_definition', 'small_calculation'].includes(row.id) && row.actual.startsWith('delegate_codex')).length,
  corpusHash: hash(JSON.stringify(cases)), promptHash: hash(system), toolSchemaHash: hash(JSON.stringify(TOOL_DEFINITIONS)),
  scope: 'One real manager model call per synthetic case. No tool dispatch, Discord access, searches, Codex jobs, or external writes. Old baseline is exact forced-regex policy without the optional semantic classifier.' };
await writeFile(`${out}/summary.json`, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary));
