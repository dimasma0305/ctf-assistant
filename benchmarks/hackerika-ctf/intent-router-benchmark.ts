import { writeFile } from 'node:fs/promises';
import { requiresCTFSolve, ctfToolAvailable } from '../../src/Services/AI/ctf';
import { requiresResearch } from '../../src/Services/AI/research';
import { classifyTurnIntent, needsSemanticRouting, type IntentInput, type TurnIntent } from '../../src/Services/AI/intentRouter';
import { MODELS } from '../../src/Services/AI/models';

const cases: { id: string; input: IntentInput; expected: TurnIntent }[] = [
  { id: 'web_thread_followup', input: { text: 'bantu soal web yang kemarin', threadName: 'TCP1P web challenge', threadStarter: 'Bantu pecahkan challenge web ini' }, expected: 'ctf_solve' },
  { id: 'wordpress_owner', input: { text: 'tolong kerjain yang wordpress punyaku', recent: ['Aku punya challenge WordPress di TCP1P'] }, expected: 'ctf_solve' },
  { id: 'thread_short_help', input: { text: 'bantuin soal ini', threadName: 'CTF web', threadStarter: 'Ada challenge web dari TCP1P' }, expected: 'ctf_solve' },
  { id: 'person_osint', input: { text: 'bantu osint tentang <@123456789012345678>', recent: ['Siapa akun Discord ini?'] }, expected: 'research' },
  { id: 'math_homework', input: { text: 'bantu solve soal matematika ini' }, expected: 'chat' },
  { id: 'platform_recommendation', input: { text: 'saran platform CTF yang bisa deploy' }, expected: 'research' },
  { id: 'wordpress_support', input: { text: 'tolong cek plugin WordPress ku' }, expected: 'chat' },
  { id: 'explicit_ctf', input: { text: 'solve challenge ku yang tentang wordpress, yang mana aja' }, expected: 'ctf_solve' },
];
const holdout: typeof cases = [
  { id: 'crypto_teammate', input: { text: 'bantuin soal crypto dari W' }, expected: 'ctf_solve' },
  { id: 'writeup_lookup', input: { text: 'cek challenge WordPress ini sudah ada writeup belum' }, expected: 'research' },
  { id: 'school_question', input: { text: 'bantu soal web untuk ujian sekolah' }, expected: 'chat' },
  { id: 'discord_channel_lookup', input: { text: 'tolong cari channel Discord yang bahas soal web' }, expected: 'chat' },
  { id: 'person_osint_plain', input: { text: 'tolong bantu OSINT si Dimas di Discord' }, expected: 'research' },
  { id: 'explicit_flag', input: { text: 'cari flag dari clue biner ini' }, expected: 'ctf_solve' },
];
const validation: typeof cases = [
  { id: 'colloquial_continuation', input: { text: 'lanjutin soal web yang tadi', threadName: 'CTF web' }, expected: 'ctf_solve' },
  { id: 'writeup_search', input: { text: 'cari writeup untuk challenge ini' }, expected: 'research' },
  { id: 'exam_question', input: { text: 'tolong bantuin solve soal ujian jaringan' }, expected: 'chat' },
  { id: 'explain_challenge', input: { text: 'boleh jelasin chall ini?' }, expected: 'chat' },
  { id: 'repository_check', input: { text: 'cek GitHub repo challenge WordPress milikku' }, expected: 'research' },
  { id: 'person_profile', input: { text: 'tolong riset profil <@123456789012345678>' }, expected: 'research' },
];
const split = process.argv.includes('--validation') ? 'validation' : process.argv.includes('--holdout') ? 'holdout' : 'development';
const selected = split === 'validation' ? validation : split === 'holdout' ? holdout : cases;
const index = process.argv.indexOf('--out');
const output = index >= 0 ? process.argv[index + 1] : '';
if (!output || await Bun.file(output).exists()) throw new Error('Use --out FRESH_JSON');

const rows = [];
for (const item of selected) {
  const context = [item.input.threadName, item.input.threadStarter, ...(item.input.recent || [])].filter(Boolean).join('\n');
  const ctf = requiresCTFSolve(item.input.text, context), research = requiresResearch(item.input.text);
  const baseline: TurnIntent = ctf ? 'ctf_solve' : research ? 'research' : 'chat';
  const consulted = needsSemanticRouting(item.input.text, { ctf, research });
  const start = performance.now();
  const classified = consulted ? await classifyTurnIntent(item.input) : null;
  const candidate = classified || baseline;
  rows.push({ id: item.id, expected: item.expected, baseline, consulted, classified, candidate,
    elapsedMs: Math.round(performance.now() - start), ctfToolAvailable: ctfToolAvailable(item.input.text, context) });
}
const correct = (key: 'baseline' | 'candidate') => rows.filter(row => row[key] === row.expected).length;
const report = { at: new Date().toISOString(), model: MODELS.light, split, method: 'Live classifier calls only for ambiguous cases; deterministic baseline and candidate use the same frozen inputs.',
  rows, correct: { baseline: correct('baseline'), candidate: correct('candidate'), total: selected.length },
  classifierCalls: rows.filter(row => row.consulted).length };
await writeFile(output, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.correct));
if (correct('candidate') < correct('baseline')) process.exitCode = 2;
