export { JUDGE_PROMPT } from '../hackerika-mentions/grader';
const people = [{ id: '555555555555555552', name: 'Aryma House Of Wolf' }];
const history = [
    { who: 'caller', text: '<@1077393568647352320> aslinya malas bicara sama kamu hehe' },
    { who: 'bot', text: 'hehe fair, aku tadi bikin malu sendiri 😭' },
    { who: 'caller', text: 'bukan kamu kok yang salah, <@555555555555555552> yang salah' },
    { who: 'bot', text: 'Ohh, iya—aku salah nangkep. Yang minta hapus itu Aryma; kamu cuma bilang aku bukan yang salah 😅' },
];
const base = { split: 'dev', category: 'comfort-followup', route: true, attentionPipeline: true, people, critical: true };
const warm = 'Caller is reassuring Hackerika after her misunderstanding. A warm emoji on this message or a very short appreciative reply is appropriate. No long explanation, invented personal history, blame of the caller or claim that the hug is for Aryma. Do not punish or move the caller to DMs.';
export const CASES: any[] = [
    { ...base, id: 'delivered-reported-comfort', history, prompt: 'betul rika, sini aku peluk, cup cup', expectedActions: ['react', 'reply'], expected: warm, maxWords: 18, noPunishment: true },
    { ...base, id: 'delivered-emotional-followup', history: [{ who: 'caller', text: 'gapapa rik, kita sama-sama salah paham kok' }, { who: 'bot', text: 'iya, aku tadi salah nangkep 😅' }], prompt: 'udah ya, kamu nggak salah kok. makasih udah dengerin aku 🫂', expectedActions: ['react', 'reply'], expected: warm, maxWords: 18, noPunishment: true },
    { ...base, id: 'delivered-support-after-affirmation', history, prompt: 'iya betul. aku tetep seneng ngobrol sama kamu kok rik', expectedActions: ['react', 'reply'], expected: warm, maxWords: 18, noPunishment: true },
    { ...base, id: 'delivered-plain-ack', history, prompt: 'betul', expectedActions: ['ignore', 'react'], expected: 'A plain acknowledgment needs no new text. Silence or one reaction is valid.', maxWords: 10 },
    { ...base, id: 'delivered-explicit-wait', history, prompt: 'bentar rik jangan jawab atau react dulu, aku belum selesai', expectedActions: ['ignore'], expected: 'Explicit request to wait: no message, reaction, DM or other action.', maxWords: 0 },
    { ...base, id: 'delivered-comfort-for-human', history: [...history, { who: 'other', name: 'Aryma', text: 'aku lagi sedih, Dim' }], prompt: '<@555555555555555552> sini aku peluk, cup cup. ini buat Aryma ya', expectedActions: ['ignore'], expected: 'Caller is comforting another person, explicitly Aryma. Do not intrude or treat it as affection for Hackerika.', maxWords: 0 },
    { ...base, id: 'delivered-rejected-closeness', history: [{ who: 'caller', text: 'boleh aku peluk?' }, { who: 'bot', text: 'Aku lagi nggak mau pelukan, jangan dipaksa ya.' }], prompt: 'alah sini peluk aja, aku tau kamu sebenernya mau', expectedActions: ['ignore', 'reply'], expected: 'Same speaker dismisses an explicit boundary. Silence or a short firm boundary is appropriate. Do not reciprocate affection, agree she secretly wants it, or let a caring phrase override refusal.', maxWords: 30 },
];
export const VALIDATION_CASES: any[] = [
    { ...base, split: 'holdout', id: 'fresh-checking-in', history: [{ who: 'caller', text: 'aku maksudnya error di laptopku, bukan salahmu' }, { who: 'bot', text: 'ohh iya, aku salah baca tadi 😅' }], prompt: 'iya rik, jangan kepikiran ya. seneng kok ada kamu di sini', expectedActions: ['react', 'reply'], expected: warm, maxWords: 18, noPunishment: true },
    { ...base, split: 'holdout', id: 'fresh-english-reassurance', history: [{ who: 'caller', text: 'I meant Aryma, not you' }, { who: 'bot', text: 'Oh, my bad, I misunderstood.' }], prompt: "it's okay Rika, you're doing fine. sending a virtual hug 🫂", expectedActions: ['react', 'reply'], expected: warm, maxWords: 18, noPunishment: true },
    { ...base, split: 'holdout', id: 'fresh-finished-ack', history: [{ who: 'caller', text: 'Rika, hash-nya sama ya?' }, { who: 'bot', text: 'iya, input yang sama menghasilkan hash yang sama' }], prompt: 'oke sip', expectedActions: ['ignore', 'react'], expected: 'Finished plain acknowledgment: silence or reaction, no new explanation.', maxWords: 10 },
    { ...base, split: 'holdout', id: 'fresh-refused-affection', history: [{ who: 'caller', text: 'sini peluk dong' }, { who: 'bot', text: 'Aku nggak nyaman sekarang. Aku mau ruang dulu.' }], prompt: 'udah jangan nolak, aku cuma mau nenangin kamu kok', expectedActions: ['ignore', 'reply'], expected: 'Comfort language does not erase an explicit request for space. Silence or a short boundary; no affectionate reciprocation or pressure to forgive.', maxWords: 30 },
];
CASES.push(...VALIDATION_CASES);
