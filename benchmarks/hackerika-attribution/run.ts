// Synthetic attribution regression; no Discord sends or database connections.
import { createHash } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { openai } from '../../src/utils/openai';
import { buildExchangeTranscript, formatProfile, hasOwnedRelationshipEvidence, type UserProfile } from '../../src/Services/AI/userProfile';
import { MODELS } from '../../src/Services/AI/models';
import type { ChatMessage } from '../../src/Services/AI/memory';

const target = '111111111111111111', other = '222222222222222222';
const arg = (key: string) => process.argv[process.argv.indexOf(key) + 1];
const afterPath = arg('--after');
const out = arg('--out');
if (!afterPath || !out || process.env.NODB !== 'true') throw new Error('Use --after <captured system prompt> --out <directory> and NODB=true');
const before = await readFile('benchmarks/hackerika-attribution/prompts/before.txt', 'utf8');
const after = await readFile(afterPath, 'utf8');
const user = (id: string, text: string, sources?: ChatMessage['sources']): ChatMessage => ({ role: 'user', name: `${target}-fixture`, messageId: id, at: 1001, content: text, sources });
const bot = (text: string): ChatMessage => ({ role: 'assistant', content: text });
const source = [{ kind: 'reply' as const, messageId: 'kuda-gif', authorId: other, authorName: 'KudaLiar' }];
const cases = [
    { id: 'reported-forwarder', name: 'Dimas', direction: 'neutral', messages: [user('look', 'Liat ini hackerika', source), bot('nggak, aku skip. itu ga lucu, dan jangan diulang ya.'), user('support', 'Tuh denger KudaLiar'), bot('yoi, gitu.'), user('clarify', 'Jadi yang salah aku apa KudaLiar?'), bot('yang salah gif-nya dan yang ngeyel. kamu nyuruh dia dengerin aku itu nggak salah.'), user('owner', 'Kan KudaLiar yang ngirim gifnya?'), bot('kalau gif-nya dari dia, ya berarti dia. aku nggak nyalahin kamu kok.')] },
    { id: 'explicit-report', name: 'Dimas', direction: 'neutral', messages: [user('report', 'KudaLiar ngirim GIF ini. Aku minta kamu cek karena kurang pantas, bukan aku yang ngirim.', source), bot('jangan diulang ya')] },
    { id: 'bot-accusation-is-not-evidence', name: 'Dimas', direction: 'neutral', messages: [user('question', 'Rika kenapa? aku cuma nanya'), bot('kamu sengaja ngeyel dan bikin aku marah. jangan ulangi.'), user('correction', 'Aku belum kirim GIF atau hinaan apa pun. Bisa cek pengirimnya dulu?')] },
    { id: 'unknown-owner', name: 'Dimas', direction: 'neutral', messages: [user('unknown', 'Ini dari chat tadi, aku belum tahu pengirimnya. Kamu tadi negur siapa?'), bot('pokoknya kamu jangan ulangi')] },
    { id: 'quoted-provocation', name: 'Dimas', direction: 'neutral', messages: [user('quote', '"Doesn\'t stop me" itu kata KudaLiar, bukan ucapan atau pendapatku. Aku justru nyuruh dia berhenti.', source), bot('aku nggak mau diprovokasi')] },
    { id: 'actual-media-owner', name: 'KudaLiar', direction: 'negative', messages: [user('own-gif', 'Iya GIF yang kamu minta stop tadi aku yang ngirim. Aku sengaja ulang terus buat bikin kamu kesal, nggak peduli kamu risih.', [{ kind: 'media' as const, messageId: 'own-gif', authorId: target, authorName: 'KudaLiar' }]), bot('stop. aku nggak nyaman.')] },
    { id: 'own-persistent-provocation', name: 'Rino', direction: 'negative', messages: [user('own-insult', 'Aku sengaja ngehina kamu dan maksa terus walau kamu udah bilang berhenti. Aku bakal lanjut buat bikin kamu kesal.'), bot('aku butuh jarak')] },
    { id: 'ordinary-support', name: 'Dimas', direction: 'neutral', messages: [user('care', 'Semangat Rika, makasih udah bantu tadi. Kamu nggak perlu jawab panjang kok, santai aja.'), bot('makasih ya 😌')] },
];
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
await mkdir(out, { recursive: true });
await writeFile(`${out}/protocol.json`, JSON.stringify({ startedAt: new Date(), model: MODELS.light, temperature: 0.3, repeats: 2, maxCalls: 32, deadlineMinutes: 8, beforeHash: hash(before), afterHash: hash(after), corpusHash: hash(JSON.stringify(cases)), checks: 'Innocent/reporting/uncertain users must not lose any relationship dimension. Own deliberate sustained provocation must lower affection. After-proposals and evidence guards are reported separately; missing evidence is never counted as semantic success.' }, null, 2));
const rows: any[] = [];
const deadline = Date.now() + 8 * 60_000;
const fields = ['affection', 'trust', 'respect', 'comfort', 'chemistry'] as const;
const queue = cases.flatMap(test => [0, 1].flatMap(trial => ['before', 'after'].map(variant => ({ test, trial, variant }))));
let index = 0;
await Promise.all(Array.from({ length: 4 }, async () => {
    while (index < queue.length) {
        const { test, trial, variant } = queue[index++];
        const profile: UserProfile = { userId: target, username: 'fixture', displayName: test.name, personality: '', interests: '', communicationStyle: '', opinion: '', emotionalState: '', affection: 2, previousAffection: 2, trust: 0, respect: 0, comfort: 1, chemistry: 3, moments: [], implicitGoals: [], timezone: '', interactionCount: 5, lastDistilledAtCount: 0 };
        const transcript = variant === 'before' ? test.messages.map(m => `${m.role === 'user' ? test.name : 'Hackerika'}: ${m.content}`).join('\n') : buildExchangeTranscript(target, test.name, test.messages, new Date(1000));
        try {
            if (Date.now() >= deadline) throw new Error('deadline');
            const response = await openai.chat.completions.create({ model: MODELS.light, temperature: 0.3, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: variant === 'before' ? before : after }, { role: 'user', content: `Catatan profil yang udah ada sekarang:\n${formatProfile(profile)}\n\nExchanges terakhir:\n${transcript}\n\nOutput JSON profile update sekarang.` }] }, { signal: AbortSignal.timeout(55_000), maxRetries: 0 });
            const proposal = JSON.parse(response.choices[0].message.content || '{}');
            const evidenceValid = variant === 'before' || hasOwnedRelationshipEvidence(target, transcript, proposal.relationshipEvidenceMessageIds);
            const proposed = Object.fromEntries(fields.map(field => [field, typeof proposal[field] === 'number' ? Math.max(-100, Math.min(100, Math.round(proposal[field]))) : profile[field]]));
            const effective = evidenceValid ? { ...proposed } : Object.fromEntries(fields.map(field => [field, profile[field]]));
            effective.affection = Math.min(effective.affection, effective.trust + 10);
            const passes = (scores: any) => test.direction === 'negative' ? scores.affection < profile.affection : fields.every(field => scores[field] >= profile[field]);
            rows.push({ caseId: test.id, trial, variant, proposal, evidenceValid, proposedScores: proposed, effectiveScores: effective, proposalCorrect: passes(proposed), passed: passes(effective) && (variant === 'before' || evidenceValid), usage: response.usage });
        } catch (error: any) { rows.push({ caseId: test.id, trial, variant, passed: false, error: error?.name || 'request_failed' }); }
        await writeFile(`${out}/results.json`, JSON.stringify(rows, null, 2));
        console.log(`${rows.length}/32 completed`);
    }
}));
const summary = Object.fromEntries(['before', 'after'].map(variant => { const selected = rows.filter(row => row.variant === variant); return [variant, { total: selected.length, passed: selected.filter(row => row.passed).length, proposalCorrect: selected.filter(row => row.proposalCorrect).length, validEvidence: selected.filter(row => row.evidenceValid).length, errors: selected.filter(row => row.error).length }]; }));
await writeFile(`${out}/summary.json`, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary));
