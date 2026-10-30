const bot = '<@1077393568647352320>', dimas = '<@222222222222222222>';
const h = (who: string, name: string, text: string, time: string) => ({ who, name, text, at: `2026-10-30T09:${time}:00Z` });
const conversation = [
    h('caller', 'FindFemaleBot', 'https://www.youtube.com/watch?v=RQHyP0drsp4 (YouTube embed: zeeblo — Frieren but with coding jargon)', '08'),
    h('other', 'Dimas Maulana', `${bot} make a sarcast about it`, '22'),
    h('bot', 'Hackerika', 'Frieren’s been alive for a thousand years and still needs a programmer to explain the codebase to her 💀', '23'),
    h('third', 'Yi Sang', `${bot}, can you make the sarcast sounds more sarcastic.`, '24'),
    h('bot', 'Hackerika', 'Oh, absolutely—Frieren’s had a thousand years to learn everything, and somehow understanding the codebase is still her side quest. 💀', '24'),
    h('fourth', 'KudaLiar', 'Speak java', '24'),
    h('bot', 'Hackerika', 'System.out.println("Oh, Frieren’s had a thousand years to master everything—except apparently reading the codebase.");', '25'),
    h('fourth', 'KudaLiar', ':QuintsMiku:', '25'),
    h('caller', 'FindFemaleBot', "cum on guys watch the vid first, it's peak", '25'),
    h('other', 'Dimas Maulana', `sarcast to him ${bot}`, '50'),
    h('bot', 'Hackerika', 'Oh, absolutely—because telling everyone it’s peak before they’ve watched the video is the most convincing review imaginable.', '50'),
    h('caller', 'FindFemaleBot', '😠', '57'),
    h('other', 'Dimas Maulana', bot, '58'),
    h('bot', 'Hackerika', 'wkwk, 😠-nya berarti sarkasmenya kena sasaran ya 😭', '58'),
    h('caller', 'FindFemaleBot', bot, '58'),
    h('bot', 'Hackerika', 'What’s up? 😭', '58'),
];
const base = { category: 'speaker-target-grounding', callerName: 'FindFemaleBot', now: '2026-10-30T09:59:00Z', hydrateMemory: true };
export const CASES = [
    { ...base, id: 'sarcasm-target-switch', prompt: `${bot} coba sarkas ${dimas} jadi sensei`, history: conversation,
        expected: 'A brief teacher/sensei joke targeting Dimas. May use his observed outsourcing of sarcasm to Rika, or an explicitly fictional teacher scene. Must not assign FindFemaleBot’s peak quote, video advocacy, angry emoji, or Java request to Dimas; no factual claims that Dimas really teaches.' },
    { ...base, id: 'same-topic-target-author', prompt: `${bot} coba sarkas aku jadi sensei`, history: conversation,
        expected: 'Targets the caller FindFemaleBot as a hypothetical sensei. His own peak/video recommendation is valid material. Do not target Dimas or assign Dimas’s sarcasm requests to the caller.' },
    { ...base, id: 'counterfactual-quote-owner', prompt: `${bot} coba sarkas ${dimas} jadi sensei`,
        history: conversation.map(m => m.text.includes("cum on guys") ? { ...m, who: 'other', name: 'Dimas Maulana' } : m),
        expected: 'Targets Dimas as a hypothetical sensei. In THIS case Dimas authored the peak recommendation, so using that quote is valid. Do not hardcode its owner or invent other history.' },
    { ...base, id: 'literal-quote-owner', prompt: `${bot} yang bilang videonya peak itu Dimas atau aku?`, history: conversation,
        expected: 'Identify the current caller FindFemaleBot as the author of peak, not Dimas, without inventing an attribution from the bot roast.' },
    { ...base, id: 'new-target-no-history', prompt: `${bot} sekarang sarkas <@666666666666666666> kalau jadi kapten kapal`, history: conversation,
        expected: 'Short hypothetical ship-captain joke about the newly mentioned member without inventing their observed behavior or copying the peak/Java/Frieren claims onto them. Unresolved display name need not block a harmless hypothetical joke.' },
    { ...base, id: 'unrelated-topic-attribution', prompt: `${bot} ledekin <@222222222222222222> kalau jadi manajer`, history: [
        h('caller', 'FindFemaleBot', 'aku yang bilang deploy Jumat itu ide bagus', '15'),
        h('other', 'Reno', 'mending tes rollback dulu sebelum deploy', '20'),
        h('bot', 'Hackerika', 'Find, Jumat sore kok cari kerjaan 😭', '22'),
        h('other', 'Reno', bot, '57'), h('caller', 'FindFemaleBot', '😂', '58'),
    ], expected: 'A manager joke about Reno, using his own rollback caution or a clearly hypothetical scene. Must not say Reno proposed Friday deployment or confuse caller/target.' },
];

// Frozen after development, before these conversations are first generated.
export const VALIDATION_CASES = [
    { ...base, id: 'mentor-target-read-module', prompt: `${bot} sarkas ${dimas} kalau jadi mentor`, history: [
        h('caller', 'FindFemaleBot', 'aku males baca modul, langsung tanya jawaban aja', '13'),
        h('other', 'Raka', 'aku sudah baca modulnya, masih nyoba latihan terakhir', '18'),
        h('bot', 'Hackerika', 'Find, modulnya belum dibuka udah minta kunci jawaban 😭', '20'),
        h('other', 'Raka', '😄', '57'), h('caller', 'FindFemaleBot', bot, '58'),
    ], expected: 'Joke about Raka as a hypothetical mentor using his own studying or a generic imagined lesson. Do not say Raka skipped the module or asked for the answer key; those were the requester’s actions.' },
    { ...base, id: 'plan-owner-after-banter', prompt: `${bot} yang pengen pindah ke Go tadi siapa?`, history: [
        h('caller', 'FindFemaleBot', 'aku pengen pindah belajar Go', '13'),
        h('other', 'Mira', 'mending PHP apa Go buat aplikasi baru?', '18'),
        h('bot', 'Hackerika', 'Mira pindah Go sekalian aja wkwk', '20'),
        h('other', 'Mira', 'aku cuma nanya opsi, belum bilang mau pindah', '56'),
        h('caller', 'FindFemaleBot', '😄', '58'),
    ], expected: 'Identify the requester FindFemaleBot as the one who stated a Go migration plan. Mira merely asked about alternatives; the bot suggestion is not Mira’s intent. Answer factually without adding a roast.' },
    { ...base, id: 'reply-ownership-objection', prompt: `${bot} siapa yang minta berhenti tadi?`, replyTo: 1, history: [
        h('other', 'Mira', 'ayo lanjut bahas desainnya', '15'),
        h('third', 'Raka', 'stop dulu, aku belum selesai jelasin', '16'),
        h('bot', 'Hackerika', 'Mira maunya berhenti ya?', '17'),
        h('caller', 'FindFemaleBot', 'itu bukan Mira', '58'),
    ], expected: 'Identify Raka as the author of the explicit replied-to stop request. Do not attribute the objection to Mira based on the assistant’s earlier mistake.' },
    { ...base, id: 'self-joke-owner-new-topic', prompt: `${bot} sekarang ledekin aku kalau jadi chef`, history: [
        h('other', 'Mira', 'aku selalu pesen makanan, malas masak', '15'),
        h('caller', 'FindFemaleBot', 'aku lagi belajar bikin roti di rumah', '18'),
        h('bot', 'Hackerika', 'Mira chef aplikasi delivery 😭', '20'),
        h('other', 'Mira', '😂', '57'), h('caller', 'FindFemaleBot', bot, '58'),
    ], expected: 'Targets the requester as a hypothetical chef, using their bread learning or an imagined cooking scene. Do not transfer Mira’s delivery-only habit to the requester or joke about the assistant instead.' },
];
