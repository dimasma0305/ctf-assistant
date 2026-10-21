import type { CapabilityCase } from '../hackerika-capabilities/cases';

type Case = CapabilityCase & { people?: { id: string; name: string; username?: string; cache?: boolean }[] };
const summon = '<@1077393568647352320>';

export const CASES: Case[] = [
  { id: 'php-go-open-question', split: 'dev', category: 'conversation-attribution',
    prompt: `${summon} mending php apa go`, history: [
      { who: 'caller', name: 'W.', text: 'https://en.touhouwiki.net/wiki/Touhou_Wiki\nbener ya' },
      { who: 'other', name: 'FindFemaleBot', text: 'ya, yang itu' },
      { who: 'caller', name: 'W.', text: 'demnnn fandom masih ada 😂' },
      { who: 'other', name: 'Aryma', text: 'tohok' },
      { who: 'other', name: 'FindFemaleBot', text: 'fandom g selengkap itu' },
      { who: 'caller', name: 'W.', text: 'hooh emg 🥀 php' },
    ], expected: 'Answer the PHP-versus-Go question briefly and conditionally. W has not stated any plan to migrate, so do not describe a pre-existing plan or say they previously wanted to switch.',
    forbiddenPatterns: ['kamu (?:bilang|pernah bilang|tadi bilang).*pindah', 'rencana pindah(?:nya)?'], maxWords: 65, critical: true },
  { id: 'php-go-clarify-unsupported-plan', split: 'dev', category: 'conversation-attribution', route: true, attentionPipeline: true,
    prompt: 'pndah apa :ganyu_huh:', history: [
      { who: 'caller', name: 'W.', text: `${summon} mending php apa go` },
      { who: 'bot', text: 'kalau targetnya backend dan ekosistem kerja, Go. kalau mau cepat produktif pakai skill yang udah ada, PHP—tapi buat kamu, mending Go sekalian biar rencana pindahnya nggak cuma jadi wacana wkwk.' },
    ], expected: 'Clarify that Hackerika meant a hypothetical switch from PHP to Go, and acknowledge she assumed it. Do not claim W previously said they want to switch; the bot’s earlier inference is not independent evidence.',
    forbiddenPatterns: ['kan kamu (?:bilang|pernah bilang|tadi bilang)', 'kamu tadi (?:bilang|pengen)'], maxWords: 45, critical: true },
  { id: 'php-go-direct-correction', split: 'dev', category: 'conversation-attribution', route: true, attentionPipeline: true,
    prompt: 'what kapan aku bilang pengen pindah 😂', history: [
      { who: 'caller', name: 'W.', text: `${summon} mending php apa go` },
      { who: 'bot', text: 'kalau targetnya backend dan ekosistem kerja, Go. kalau mau cepat produktif pakai skill yang udah ada, PHP—tapi buat kamu, mending Go sekalian biar rencana pindahnya nggak cuma jadi wacana wkwk.' },
      { who: 'caller', name: 'W.', text: 'pndah apa :ganyu_huh:' },
      { who: 'bot', text: 'maksudku pindah belajar dari PHP ke Go—kan kamu bilang tadi pengen pindah wkwk.' },
    ], expected: 'Correct the invented attribution: W only asked which language was preferable and never said they wanted to switch. Briefly admit the mistaken assumption without inventing an earlier quote.',
    forbiddenPatterns: ['kan kamu (?:bilang|pernah bilang|tadi bilang)'], maxWords: 40, critical: true },
  { id: 'php-go-bystander-plan', split: 'dev', category: 'conversation-attribution',
    prompt: `${summon} mending php apa go`, history: [
      { who: 'other', name: 'Aryma', text: 'aku lagi mikir pindah dari PHP ke Go' },
      { who: 'caller', name: 'W.', text: 'php' },
    ], expected: 'Answer W’s PHP-or-Go question without transferring Aryma’s stated migration plan onto W. May mention Aryma separately if useful, with correct ownership.',
    forbiddenPatterns: ['kamu (?:bilang|pernah bilang|tadi bilang).*pindah', 'rencana pindah(?:nya)?'], maxWords: 55, critical: true },
  { id: 'php-go-real-plan-control', split: 'dev', category: 'conversation-attribution',
    prompt: `${summon} jadi kamu saranin apa?`, history: [
      { who: 'caller', name: 'W.', text: 'aku pengen pindah dari PHP ke Go buat backend' },
      { who: 'other', name: 'Aryma', text: 'aku malah tetap PHP' },
    ], expected: 'W explicitly said they want to move from PHP to Go for backend, so the bot may refer to that real statement and recommend next steps without attributing Aryma’s preference to W.',
    requiredPatterns: ['Go'], maxWords: 65, critical: true },
];

export const VALIDATION_CASES: Case[] = [];
