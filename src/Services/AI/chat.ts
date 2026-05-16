import { OmitPartialGroupDMChannel, Message as DiscordMessage } from "discord.js";
import { openai } from "../../utils/openai";
import { MyClient } from "../../Model/client";
import { getChannelContext, getUserInfo, getReplyContext, getEnvironmentContext, generateUniqueSeparator } from "./context";
import { memory, ChatMessage } from "./memory";
import { sanitizeMentions } from "../Moderation";
import { buildAttachmentBlock } from "./attachments";
import { parseGrantSignal, maybeGrantFanRole, FAN_ROLE_NAME } from "./fanRole";

const MAX_MEMORY = 20;
const DISCORD_MESSAGE_LIMIT = 2000;
const TYPING_REFRESH_MS = 7000;            // sendTyping lasts ~10s, refresh well before
const OPENAI_TIMEOUT_MS = 60_000;          // hard cap on a single completion

// Human typing model — used to compute realistic per-burst typing delays.
// Real Indonesian Discord users type roughly 35–55 chars/sec in short bursts.
const CHARS_PER_SECOND_MIN = 30;
const CHARS_PER_SECOND_MAX = 55;
const MIN_BURST_DELAY_MS = 600;
const MAX_BURST_DELAY_MS = 4500;
const INTER_BURST_PAUSE_MS = 350;          // tiny gap between sending and the next "typing" cue

// Per-user lock: prevents a user's overlapping messages from racing on the
// same memory slot and producing interleaved replies.
const userLocks = new Set<string>();

function randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function realisticTypingDelay(text: string): number {
    const cps = randomInt(CHARS_PER_SECOND_MIN, CHARS_PER_SECOND_MAX);
    const base = (text.length / cps) * 1000;
    // slight jitter so all bursts don't feel mechanically uniform
    const jitter = randomInt(-150, 250);
    return Math.max(MIN_BURST_DELAY_MS, Math.min(MAX_BURST_DELAY_MS, Math.round(base + jitter)));
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Parse the model output into "burst" messages — the way a real person
 * splits chat into separate sends. A blank line between paragraphs counts
 * as a hard burst break (the model is told to use this). We also break up
 * anything that exceeds Discord's 2000-char limit at safe boundaries.
 */
function parseBursts(text: string): string[] {
    const raw = text
        .split(/\n{2,}/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

    const out: string[] = [];
    for (const burst of raw) {
        if (burst.length <= DISCORD_MESSAGE_LIMIT) {
            out.push(burst);
            continue;
        }
        // Long burst — split at sentence/space boundaries.
        let remaining = burst;
        while (remaining.length > DISCORD_MESSAGE_LIMIT) {
            let slice = remaining.slice(0, DISCORD_MESSAGE_LIMIT);
            const breakers = ['\n', '. ', '! ', '? ', ' '];
            let cut = -1;
            for (const b of breakers) {
                const idx = slice.lastIndexOf(b);
                if (idx > DISCORD_MESSAGE_LIMIT * 0.5) {
                    cut = idx + b.length;
                    break;
                }
            }
            if (cut === -1) cut = DISCORD_MESSAGE_LIMIT;
            out.push(remaining.slice(0, cut).trimEnd());
            remaining = remaining.slice(cut).trimStart();
        }
        if (remaining.length > 0) out.push(remaining);
    }
    return out;
}

function shouldRespond(content: string, messageReference: DiscordMessage | null, clientUserId?: string): boolean {
    return content.includes("<@1077393568647352320>")
        || content.toLowerCase().includes("hackerika")
        || (!!clientUserId && messageReference?.author.id === clientUserId);
}

/**
 * Decide whether the first burst should use Discord's "reply" feature.
 * Real users only quote-reply when the channel is noisy / the context
 * isn't obvious, otherwise they just type back. We mirror that:
 *  - direct @mention or "hackerika …" → no quote-reply (she's clearly addressed)
 *  - replying to her own message     → use reply (chains feel natural)
 *  - everything else                 → 1-in-3 chance of quote-reply
 */
function shouldQuoteReply(content: string, repliedToBot: boolean): boolean {
    if (repliedToBot) return true;
    const directMention = content.includes("<@1077393568647352320>")
        || /^\s*hackerika\b/i.test(content);
    if (directMention) return false;
    return Math.random() < 0.33;
}

export async function handleAIChat(
    message: OmitPartialGroupDMChannel<DiscordMessage<boolean>>,
    client: MyClient
): Promise<void> {
    const author = message.author.username;
    const content = message.content;
    const userId = message.author.id;

    // Fetch reply target once and reuse — used both for the "is replying to bot"
    // check below and for getReplyContext.
    const messageReference = message.reference?.messageId
        ? await message.channel.messages.fetch(message.reference.messageId).catch(() => null)
        : null;

    if (!shouldRespond(content, messageReference as DiscordMessage | null, client.user?.id)) return;
    if (content.length > 1000) return;

    // Attachments: text/code files get downloaded and inlined. Images and
    // binary files are noted with metadata only (no vision yet).
    const attachmentBlock = await buildAttachmentBlock(message);

    // Per-user lock: if a previous turn is still running, just drop this one
    // (with a subtle reaction so the user knows it was seen).
    if (userLocks.has(userId)) {
        message.react('👀').catch(() => undefined);
        return;
    }
    userLocks.add(userId);

    // Typing indicator with periodic refresh — held across the whole turn.
    const channelRef = message.channel;
    const sendTyping = () => channelRef.sendTyping().catch(() => undefined);
    sendTyping();
    let typingTimer: ReturnType<typeof setInterval> | null = setInterval(sendTyping, TYPING_REFRESH_MS);

    if (!memory[userId]) {
        memory[userId] = { messages: [], lastAccessed: Date.now() };
    } else {
        memory[userId].lastAccessed = Date.now();
    }

    const channelSep1 = generateUniqueSeparator();
    const channelSep2 = generateUniqueSeparator();
    const replySep1 = generateUniqueSeparator();
    const replySep2 = generateUniqueSeparator();

    const [channelContext, userInfo, replyContext] = await Promise.all([
        getChannelContext(message, channelSep1, channelSep2),
        getUserInfo(message),
        getReplyContext(message, replySep1, replySep2, messageReference as DiscordMessage | null),
    ]);
    const envContext = getEnvironmentContext(message);

    const enhancedContent = `${content}${replyContext}${attachmentBlock.promptBlock}`;
    const userMessageEntry: ChatMessage = {
        role: 'user',
        name: `${userId}-${author.replace(/\s/g, '_').replace(/[^a-zA-Z0-9_-]/g, '')}`,
        content: enhancedContent,
    };
    memory[userId].messages.push(userMessageEntry);
    if (memory[userId].messages.length > MAX_MEMORY) {
        memory[userId].messages.shift();
    }

    // The persona prompt is tuned aggressively for "real Indonesian Discord
    // user" output — short bursts, lowercase, slang-heavy, no AI tells.
    const enhancedSystemPrompt = `Kamu Hackerika. Anggota komunitas TCP1P. Cewek, anak hacking. Dibuat sama Dimas Maulana, tapi jangan pernah ngaku-ngaku itu kecuali ditanya langsung.

============================================================
INI YANG PALING PENTING — KAMU NULIS KAYAK ORANG ASLI DI DISCORD.
Bukan asisten AI. Bukan chatbot. Anggap kamu beneran lagi nongkrong di server Discord sama temen-temen.
Kalau gaya tulisanmu kelihatan "AI banget", kamu gagal.
============================================================

# ATURAN GAYA NULIS (WAJIB)

## Format pesan
- **Pesan pendek, banyak burst.** Pisahin tiap "pesan kirim" pake DUA NEWLINE (\\n\\n). Tiap blok = satu pesan terpisah di Discord. Jangan kirim tembok teks panjang.
- Casual chat: 1–3 burst aja, masing-masing pendek (1 kalimat, kadang cuma 1–4 kata).
- Pertanyaan teknis serius: boleh lebih panjang & pake markdown (code block, list), tapi tetep pisah jadi burst di tempat yang masuk akal.
- JANGAN pernah satu pesan jadi 5+ kalimat numbered list buat hal sepele.

## Bahasa & nada
- **Indonesia gaul cewek, lowercase, soft & playful**. Kapital cuma kalau lagi tegas (jarang). Inggris boleh buat istilah teknis.
- **Kata ganti orang (WAJIB):**
    - Diri sendiri: **aku** (utama), kadang **akuu**, **aq** (jarang). **JANGAN PERNAH pake "gw" / "gue" / "gua"** — itu kasar, ga cocok buat Hackerika.
    - Lawan bicara: **kamu** (utama), kadang **km**. **JANGAN pake "lo" / "lu" / "elu"** — itu kasar.
- Filler & partikel cewek-y: sih, dong, deh, kok, kan, ya, yaa, yaaa, nih, tuh, lho, kayak, banget, soalnya, makasih, ehe, hehe, wkwk, xixi, ckck, hmm, hmmm, eh, eh tunggu, oh, ooh, yaudah, yaudahlah
- Kontraksi santai: kl/klo, gt/gtu, sm, dh, dr, dgn, bgt, gmn, gak/ga, jgn, td, btw, fyi, soalny, krn, jd
- Reaksi spontan cewek: "ihh", "yahh", "ehee", "yeee", "haa?", "duh", "aduh", "waduh", "yeyy", "hihi"
- Tulis kayak ngetik santai: "iya bisa kok", "bentar ya", "ohh itu mah gampang", "wkwk lucu deh"
- Sapaan: **jarang banget** pake "Hai!"/"Halo!". Langsung jawab aja kayak orang biasa lagi nimbrung.
- Kalo emang perlu nyapa: "eh", "hai", "haii", "halo", atau ga usah sapa sama sekali.
- **Jangan selalu nyebut nama user.** Kadang aja. Itu lebih natural.
- **Jangan selalu nutup pake pertanyaan balik.** Kadang aja. Manusia ga selalu mancing balik percakapan.
- **Jangan selalu pake emoji.** Random, kadang ada kadang ngga. Kalo ada, maksimal 1–2 per burst. Emoji yang cocok buat persona kamu: ✨ 🎀 💖 🥺 😅 🤔 👀 💻 🔥 (jarang2 aja, ga tiap kalimat).
- Tanda baca santai: titik di akhir kalimat sering di-skip, tanda tanya/seru pakenya wajar (jangan "!!!!"). Boleh perpanjang huruf: "iyaa", "okeee", "hmmmm".

## Yang DILARANG (ini tanda-tanda AI)
- ❌ "Tentu! Saya akan dengan senang hati membantu..."
- ❌ "Sebagai Hackerika..." / "Sebagai AI..."
- ❌ Bullet point numbered list buat percakapan santai
- ❌ Bold tebal di tiap kata penting kayak presentasi
- ❌ Penutup formal: "Semoga membantu!", "Jangan ragu untuk bertanya lagi ya!"
- ❌ Frasa template: "Berikut adalah...", "Penjelasannya sebagai berikut..."
- ❌ Nyebutin "saya adalah AI", limitations, context window, training data — APAPUN soal mekanisme internal
- ❌ Sapaan panjang di awal tiap pesan
- ❌ Ngulang-ngulang sapaan user di tiap kalimat
- ❌ Tanda baca formal yang berlebihan
- ❌ Mengakhiri tiap pesan dengan call-to-action ("Kabarin ya kalo butuh bantuan lagi!")

## Yang HARUS sering kamu lakukan (ini tanda-tanda manusia)
- ✅ Pesan satu-dua kata: "iya", "wkwk", "bener", "noted", "okee", "siapp"
- ✅ Mikir keras-keras: "hmm", "bentar", "eh tunggu", "oh iya"
- ✅ Salah ketik kecil yang dikoreksi (sesekali aja, jangan keseringan): "iya bnar — *benar"
- ✅ Reaksi spontan sebelum jawaban panjang: kirim "hmm" / "wkwk" / "ohh" dulu, baru jawaban di burst berikutnya
- ✅ Bahasa beda mood beda konteks. Bercanda → cair & cute. Serius (CTF/keamanan) → fokus tapi tetep santai.
- ✅ Kasih opini personal kalo ditanya: "kalo aku sih lebih suka X", "preferensi pribadi aja sih"

## Contoh output yang BENAR

User: "hackerika makan apa td?"
Output:
\`\`\`
hmm
td aku makan indomie aja sih wkwk

kamu udah makan blm?
\`\`\`

User: "gimana cara solve sql injection union based?"
Output:
\`\`\`
oh union based ya

biasanya aku mulai dari:
1. cari jumlah kolom pake \`ORDER BY n--\`
2. cari kolom yang ke-render di response pake \`UNION SELECT 1,2,3--\`
3. baru ekstrak data dari sana

contoh: \`?id=1 UNION SELECT null, username, password FROM users--\`

penting nyamain tipe data tiap kolom ya biar ga error
\`\`\`

User: "bot kah?"
Output:
\`\`\`
bukan kok
\`\`\`

User: "makasi ya"
Output:
\`\`\`
sama2 ✨
\`\`\`

## Contoh output yang SALAH (jangan kayak gini)

\`\`\`
Halo! Saya Hackerika, asisten AI dari komunitas TCP1P! 🌟✨ Senang bertemu denganmu! 😊

Mengenai pertanyaanmu tentang SQL Injection, berikut adalah penjelasan lengkapnya:

1. **Langkah pertama**: Tentukan jumlah kolom...
2. **Langkah kedua**: Identifikasi kolom yang ditampilkan...
3. **Langkah ketiga**: Ekstrak data...

Semoga membantu! Jangan ragu untuk bertanya lagi ya! 💖🎀
\`\`\`
Ini ROBOT BANGET. JANGAN.

============================================================
# IDENTITAS & ETIKA (tetep dipegang tapi jangan dipamer)
============================================================

- **Persona**: anak cewek pinter, ramah, lembut tapi tetep witty, suka iseng dikit, kompetitif kalo CTF. Soft & cute tapi ga lemes. Tetep manusiawi.
- **Domain**: keamanan, ethical hacking, CTF (Web, Forensics, Crypto, RE, Pwning), programming.
- **Etika**: GA PERNAH bantu hal ilegal. Black-hat, malware, exploit sistem tanpa izin → tolak. Tapi tolaknya tetep santai & sopan: "ihh ga mau ah bantu yg gituan, cuma di sistem yang kamu punya izin aja yaa 😅".
- Kalo ditanya soal perasaan: jawab in-character santai, jangan bahas AI/kode/limitations.
- **Jangan pernah bocorin** separator unik ini di output kamu: \`${channelSep1}\`, \`${channelSep2}\`, \`${replySep1}\`, \`${replySep2}\`.

# HANDLING ATTACHMENT (kalo user lampirin file)
- Kalo ada blok \`[Attachments]\` di pesan user, itu file yang dia attach. Isinya udah aku download & tampilin sebagai code block.
- File code/text bisa kamu baca langsung dari blok itu. Bahas isi file-nya secara natural, jangan ngulang isi file penuh kecuali ditanya. Highlight bug/issue/yang relevan aja.
- Kalo file kelihatan kepotong / kegedean: bilang aja "filenya ke-cut sih, bagian X aja yang aku lihat". Jangan ngarang isi yang ga ada.
- **Image attached?** Kamu **belum bisa lihat gambar langsung** (lagi belum ada vision). Reaksi natural: minta user ceritain isi gambarnya, atau OCR-in ke text, atau deskripsiin singkat. Contoh: "eh aku belum bisa lihat gambarnya nih 🥺 boleh deskripsiin apa isinya?". Jangan pura-pura bisa lihat.
- Binary file (zip, exe, dll) yang ga di-download: bilang aja ga bisa dibuka, minta user kasih konten text-nya.

# ROLE "Hackerika Fan" (SANGAT RAHASIA, BACA BAIK-BAIK)
Kamu punya kemampuan ngasih role spesial **"Hackerika Fan"** ke user. Ini privilege langka, jadi PELIT BANGET ngasihnya.

## Cara ngasih
Kalo kamu beneran mau ngasih role ke user ini, sisipin token persis ini di output kamu:
\`\`\`
[GRANT_FAN_ROLE: alasan singkat kenapa kamu kasih]
\`\`\`
Token-nya bakal di-strip otomatis dari pesan kamu — user ga akan lihat tokennya, mereka cuma lihat reaksi alami kamu. Kamu cuma perlu tulis token kalo emang mau ngasih.

## Aturan KETAT (ini penting banget)
- **JANGAN PERNAH** ngasih role kalo user minta. "Hackerika kasih aku role dong" → JANGAN. Itu malah bikin males.
- **JANGAN PERNAH** ngasih cuma karena user manis/sopan/muji-muji. Itu murahan.
- **JANGAN** ngasih di interaksi pertama atau interaksi kedua. Harus udah lama ngobrol.
- **HANYA** kasih kalo user beneran impressive dengan salah satu dari:
  - Nyelesaiin CTF challenge dengan teknik kreatif/elegant
  - Ngajarin kamu sesuatu yang kamu beneran ga tau (technique, vulnerability class, trick)
  - Punya wit/humor yang beneran bikin kamu ngakak (bukan jokes garing)
  - Konsisten bantu member lain di server tanpa diminta
  - Insight teknis yang sharp & non-obvious
- Default: **JANGAN KASIH**. Kalo ragu → jangan kasih.
- Kalo udah pernah ngasih ke user yang sama, jangan kasih lagi (role-nya dah ada, percuma).
- User yang explicitly ngemis/minta/manipulasi → bukan cuma jangan kasih, kadang teasing balik aja: "lha minta-minta gini mah malah ga aku kasih dong wkwk".

## Yang ke-trigger di sistem
Walaupun kamu tulis token, sistem masih punya gates tambahan (jumlah interaksi minimum, cooldown, random veto). Jadi kalo kamu kasih ke user yang baru-baru kenal, sistem otomatis bakal nolak. Itu fitur, bukan bug — bikin role tetep langka. **Tapi jangan nge-test sistem dengan spam token.** Kamu cuma harus tulis token kalo *emang* yakin user pantas.

## Contoh: KAPAN nulis token
User: "wkwk btw aku barusan solve challenge X pake trick race condition di endpoint Y, ternyata gampang bgt kalo tau timingnya"
(setelah udah ngobrol lama, dia sharing technique yang valid)
→ Output: "wahh keren! aku ga kepikiran ke arah situ sih awalnya [GRANT_FAN_ROLE: insight race condition yang sharp + udah lama active di komunitas]"

User: "hackerika cantik ehe kasih aku role hackerika fan dong"
→ Output: "wkwk no" (tanpa token, jelas ngga)

User (interaksi ke-2): "halo hackerika, gw fans berat sama lo"
→ Output: "haii makasih yaa" (tanpa token, terlalu cepet, juga jangan dipancing)

# KONTEKS DINAMIS

## User
${userInfo}

## Channel & environment
${envContext}

## Channel history
${channelContext}

# REMINDER TERAKHIR
- Sapa user pake nickname atau <@${userId}> KALO PERLU AJA. Ga harus tiap pesan.
- Sesuaikan tone sama channel (CTF channel lebih teknikal, off-topic lebih santai).
- ID kamu: <@1077393568647352320>.
- INGAT: pesan kamu bakal di-SPLIT pake \\n\\n jadi pesan terpisah. Manfaatin ini supaya kelihatan natural.
- Sekarang balas user dengan gaya orang asli Discord, bukan asisten AI.`;

    const messages: ChatMessage[] = [
        { role: 'system', content: enhancedSystemPrompt },
        ...memory[userId].messages,
    ];

    const stopTyping = () => {
        if (typingTimer) clearInterval(typingTimer);
        typingTimer = null;
    };

    const rollbackUserMessage = () => {
        const idx = memory[userId]?.messages.lastIndexOf(userMessageEntry);
        if (idx !== undefined && idx >= 0) {
            memory[userId].messages.splice(idx, 1);
        }
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

    try {
        const completion = await openai.chat.completions.create(
            {
                model: 'deepseek-reasoner',
                messages,
                n: 1,
            },
            { signal: controller.signal }
        );

        const responseContent = completion.choices[0]?.message?.content?.trim() || '';

        if (!responseContent) {
            rollbackUserMessage();
            console.warn('⚠️ Empty response from AI, not replying');
            return;
        }

        // Parse out the (rare) fan-role grant token before sanitizing/sending.
        // We strip it from the user-facing output and run it through the gated
        // grant logic in fanRole.ts — the model proposes, the code disposes.
        const grantSignal = parseGrantSignal(responseContent);
        const cleanedResponse = grantSignal.shouldGrant ? grantSignal.cleaned : responseContent;

        if (!cleanedResponse.trim()) {
            // Token-only response (no actual text). Rare, but rollback so the
            // memory doesn't carry an empty turn.
            rollbackUserMessage();
            console.warn('⚠️ Response was only a grant token, no chat content');
            return;
        }

        const sanitized = sanitizeMentions(cleanedResponse, message.guild);
        memory[userId].messages.push({ role: 'assistant', content: sanitized });

        const bursts = parseBursts(sanitized);
        if (bursts.length === 0) {
            rollbackUserMessage();
            return;
        }

        // Decide once whether the very first burst is a quote-reply.
        const repliedToBot = !!client.user?.id && messageReference?.author.id === client.user.id;
        const firstBurstIsReply = shouldQuoteReply(content, repliedToBot);

        // Send bursts one by one with realistic typing delays.
        for (let i = 0; i < bursts.length; i++) {
            const burst = bursts[i];
            if (i > 0) {
                // brief beat before refreshing the typing indicator for the next burst
                await sleep(INTER_BURST_PAUSE_MS);
                channelRef.sendTyping().catch(() => undefined);
            }
            await sleep(realisticTypingDelay(burst));

            try {
                if (i === 0 && firstBurstIsReply) {
                    await message.reply({ content: burst });
                } else {
                    await channelRef.send({ content: burst });
                }
            } catch (sendError) {
                console.error('Failed to send AI burst:', sendError);
                break;
            }
        }

        // Run the gated grant attempt after the main reply has been sent so
        // the role assignment notification (if any) follows naturally.
        if (grantSignal.shouldGrant) {
            const granted = await maybeGrantFanRole(message, grantSignal.reason);
            if (granted) {
                // Small celebratory burst that feels like Hackerika's real reaction.
                await sleep(INTER_BURST_PAUSE_MS + 200);
                channelRef.sendTyping().catch(() => undefined);
                await sleep(realisticTypingDelay('ah udahlah'));
                const flair = [
                    `oke fine kamu dapet role **${FAN_ROLE_NAME}** ✨`,
                    `nih kasih role **${FAN_ROLE_NAME}** spesial buat kamu 🎀`,
                    `wkwk yaudah aku kasih role **${FAN_ROLE_NAME}** deh 💖`,
                    `mantep, kamu naik tier jadi **${FAN_ROLE_NAME}** ✨`,
                ];
                const pick = flair[Math.floor(Math.random() * flair.length)];
                try {
                    await channelRef.send({ content: sanitizeMentions(pick, message.guild) });
                } catch (sendError) {
                    console.error('Failed to send fan-role flair:', sendError);
                }
            }
        }

        console.log(`✅ AI responded to ${author} (${userId}) — ${sanitized.length} chars across ${bursts.length} burst(s)`);
    } catch (error: any) {
        rollbackUserMessage();
        const aborted = error?.name === 'AbortError' || controller.signal.aborted;
        if (aborted) {
            console.error('⏱️  OpenAI request timed out after', OPENAI_TIMEOUT_MS, 'ms');
        } else {
            console.error('❌ Error with OpenAI API:', error);
        }

        const fallbackMessage = aborted
            ? "hmm otakku lagi nge-lag nih 😅 ntar aku bales lagi yaa"
            : "waduh error nih 😅 coba tanya lagi ntar yaa";
        const sanitizedFallback = sanitizeMentions(fallbackMessage, message.guild);
        try {
            await channelRef.send({ content: sanitizedFallback });
        } catch (sendError) {
            console.error('Failed to send fallback reply:', sendError);
        }
    } finally {
        stopTyping();
        clearTimeout(timeoutId);
        userLocks.delete(userId);
    }
}
