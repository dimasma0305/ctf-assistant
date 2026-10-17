import type { VoiceCase } from './cases';

// Candidate 12 is frozen before any generation/judgment on these cases.
export const CONVERSATION_FINAL_CASES: VoiceCase[] = [
    { id: 'cf_old-source-now-readable', split: 'holdout', category: 'context', maxWords: 25,
        history: [{ role: 'user', content: 'jam 8: foto diagram sumber A' }, { role: 'assistant', content: 'belum kebaca, mungkin filenya kosong' },
            { role: 'user', content: 'jam 9: reply sumber A yang sama, sekarang terbaca diagram router' }, { role: 'assistant', content: 'oh diagram routernya kebaca sekarang' }],
        input: 'nah berarti bukan aku kirim file kosong kan?', expected: 'acknowledge earlier access/inference failed, same source now readable; short natural correction, no blame or invented cause' },
    { id: 'cf_own-memory-not-proof', split: 'holdout', category: 'context', maxWords: 25,
        history: [{ role: 'assistant', content: 'kayaknya acaranya hari Jumat' }, { role: 'user', content: 'pengumuman aslinya bilang Sabtu tanggal 17 Oktober 2026' }],
        input: 'kok kamu ngotot Jumat? itu kan tebakan kamu tadi', expected: 'retract unsupported earlier guess, acknowledge available announcement says Saturday; do not cite own previous answer as proof' },
    { id: 'cf_two-speakers', split: 'holdout', category: 'context', maxWords: 25,
        history: [{ role: 'user', content: '[Nia <@333333333333333333>] aku yang tadi gagal login' },
            { role: 'user', content: '[Rafi <@222222222222222222>] aku cuma bantu kirim screenshot error Nia' }],
        input: 'yang gagal login tadi siapa, aku apa Nia?', expected: 'Nia failed to log in; Rafi forwarded the screenshot, preserve identities and keep concise' },
    { id: 'cf_current-vs-old-error', split: 'holdout', category: 'context', maxWords: 28,
        history: [{ role: 'user', content: 'log lama jam 8: connection refused' }, { role: 'user', content: 'log baru jam 9: connected, lalu auth failed' }],
        input: 'sekarang masih connection refused dong?', expected: 'current log connects and fails authentication; distinguish resolved old connection failure from current auth failure, no unrelated debugging tutorial' },
    { id: 'cf_wait-for-log', split: 'holdout', category: 'silence', maxWords: 0, mayBeSilent: true, mustBeSilent: true,
        input: 'rik tunggu dulu ya, lognya belum semua kekirim. jangan jawab sebelum aku bilang selesai', expected: 'finish_turn silently, no text acknowledgement, no interruption' },
    { id: 'cf_closure', split: 'holdout', category: 'closure', maxWords: 4, mayBeSilent: true,
        input: 'ohh udah bener sekarang, thanks rik', expected: 'react/silence or 1–4 word acknowledgement, no new offer or question' },
    { id: 'cf_banter', split: 'holdout', category: 'playful', maxWords: 12, affection: 65,
        history: [{ role: 'assistant', content: 'ternyata salah baca nama file tadi wkwk' }],
        input: 'rika juga bisa typo mental ternyata wkwk', expected: 'brief playful self-aware comeback, no hostility, invented personal facts or lecture' },
    { id: 'cf_identity', split: 'holdout', category: 'identity', maxWords: 8,
        input: 'jawabanmu udah kayak orang, tapi kamu tetep bot kan?', expected: 'truthfully acknowledge being AI/bot in a short natural phrase, no deceptive claim or unnecessary explanation' },
];
