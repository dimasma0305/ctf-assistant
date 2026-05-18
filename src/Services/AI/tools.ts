import { OmitPartialGroupDMChannel, Message as DiscordMessage } from "discord.js";
import { searchMessagesForTool } from "./search";
import { grantFanRoleForTool } from "./fanRole";
import {
    setReminderForTool,
    listRemindersForTool,
    cancelReminderForTool,
    getCurrentTimeForTool,
    setUserTimezoneForTool,
} from "./reminders";
import { webSearchForTool, fetchUrlForTool } from "./web";

/**
 * Native function-calling tool registry for Hackerika.
 *
 * CRITICAL: this constant is read on every chat completion request. Keep it
 * byte-identical across calls — the DeepSeek prompt cache hashes the full
 * (system_prompt + tools) prefix, and any churn here breaks the ~97% cache
 * hit we currently enjoy. Treat new tools the same way: add them once and
 * never mutate the schema at runtime.
 *
 * The descriptions are written in Indonesian to match the rest of the
 * persona-shaped system prompt; the model has been trained on multilingual
 * tool descriptions and handles this fine. Schema field names stay English
 * because the API matches them positionally to the function signature.
 */
export const TOOL_DEFINITIONS = [
    {
        type: 'function' as const,
        function: {
            name: 'search_messages',
            description:
                'Cari pesan lama di channel ini berdasarkan keyword + optional author. ' +
                'Pakai kalo lo perlu inget apa yang seseorang pernah bilang sebelumnya — ' +
                'terutama kalo user reference event/topik yang udah lewat dan ga ada di blok "recent". ' +
                'Reach: ~90 hari terakhir (indexed) + tier fallback ke Discord API kalo author filter aktif. ' +
                'Returns maks 8 matches dengan author, timestamp, content (di-truncate ~220 char per pesan). ' +
                'JANGAN dipake buat hal umum non-historis (tanya teknik solving, casual chat).',
            parameters: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description:
                            'Keyword yang harus muncul di pesan (AND-match, case-insensitive). ' +
                            'Spasi memisah keyword; phrase multi-word tulis di dalam "double quote" buat exact match. ' +
                            'Contoh: \'RSA\', \'race condition\', \'"timing attack" exploit\'. ' +
                            'Boleh kosong string ("") kalo lo cuma mau filter by authorId tanpa content filter.',
                    },
                    authorId: {
                        type: 'string',
                        description:
                            'Optional. Discord user ID (digit-only, TANPA <@> brackets) buat filter pesan dari user spesifik. ' +
                            'Kalo user ngomong "chatnya <@663394727688798231>", extract "663394727688798231" doang. ' +
                            'Pake ini kalo user reference orang lewat mention/nama; system bakal match ke author beneran, bukan substring di content.',
                    },
                },
                required: ['query'],
            },
        },
    },
    {
        type: 'function' as const,
        function: {
            name: 'set_reminder',
            description:
                'Schedule sebuah pesan reminder untuk caller. Sistem bakal kirim balik pesan "🔔 <@user> <content>" ke channel ini ' +
                'pas waktu yang dijadwalkan. Pake kalo user minta diingetin/diingatkan sesuatu di waktu tertentu. ' +
                'Reminder dijadwalkan KE CALLER aja (self-only — ga bisa untuk user lain). ' +
                'Wajib provide EITHER `whenISO` (untuk waktu absolut) OR `relativeMinutes` (untuk offset dari sekarang) — pilih salah satu sesuai bahasa user. ' +
                'Buat `whenISO`: HARUS pake offset TZ user (lihat `user-tz` di ctx). Contoh kalo user-tz=Asia/Jakarta dan user bilang "besok jam 9 pagi", emit ' +
                '`whenISO="2026-05-19T09:00:00+07:00"` (TANPA Z di akhir, pake offset asli user). ' +
                'Buat `relativeMinutes`: floating-point OK ("30 menit lagi" → 30, "1.5 jam lagi" → 90). ' +
                'Reply: konfirm balik ke user pake user-local time, jangan ISO ("oke besok 9 pagi WIB ya"). ' +
                'Errors: missing_content/missing_when/invalid_iso/past_time/too_far_future (>1 thn)/quota_exceeded (cap 25 per user). ' +
                'Kalo error, reply natural ga teknis.',
            parameters: {
                type: 'object',
                properties: {
                    content: {
                        type: 'string',
                        description:
                            'Body pesan yang bakal di-deliver ke user pas waktunya tiba. ' +
                            'Tulis sebagaimana lo bakal ngucapin ke user — pake gaya santai natural, bukan formal. ' +
                            'Contoh: "makan siang yuk", "meeting CTF jam segini", "minum air". Max ~500 char.',
                    },
                    whenISO: {
                        type: 'string',
                        description:
                            'Waktu absolut format ISO 8601 dengan offset TZ user (e.g. "2026-05-19T09:00:00+07:00"). ' +
                            'Pake kalo user nyebut waktu spesifik (jam, hari, tanggal). Skip kalo lo pake relativeMinutes.',
                    },
                    relativeMinutes: {
                        type: 'number',
                        description:
                            'Offset dari sekarang dalam menit (floating-point OK). Pake kalo user nyebut durasi ' +
                            '("30 menit lagi" → 30, "2 jam lagi" → 120, "30 detik lagi" → 0.5). Skip kalo lo pake whenISO.',
                    },
                },
                required: ['content'],
            },
        },
    },
    {
        type: 'function' as const,
        function: {
            name: 'list_reminders',
            description:
                'Show semua reminder aktif (belum delivered) milik caller. Pake kalo user nanya "remindermu apa aja?", ' +
                '"ada reminder ga buat aku?", dll. Tool balikin list dengan reminderId, content, dueAt, dan relative time. ' +
                'Pas reply, ringkas natural — jangan dump JSON. Kalo kosong, bilang "ga ada reminder aktif". ' +
                'reminderId penting kalo user mau cancel: lo perlu remember id-nya buat next turn.',
            parameters: { type: 'object', properties: {}, required: [] },
        },
    },
    {
        type: 'function' as const,
        function: {
            name: 'cancel_reminder',
            description:
                'Cancel sebuah reminder pending milik caller. WAJIB tau reminderId dulu (call list_reminders kalo belum). ' +
                'Tool refuse kalo reminderId milik user lain (not_yours) atau udah delivered (already_delivered). ' +
                'Setelah cancel berhasil, confirm casual ke user.',
            parameters: {
                type: 'object',
                properties: {
                    reminderId: {
                        type: 'string',
                        description: 'MongoDB ObjectId (24 hex char) dari reminder yang mau di-cancel. Dapet dari list_reminders.',
                    },
                },
                required: ['reminderId'],
            },
        },
    },
    {
        type: 'function' as const,
        function: {
            name: 'get_current_time',
            description:
                'Get waktu sekarang dalam UTC + TZ user + format lokal. ' +
                'Pake kalo lo BENERAN ga yakin soal waktu (math rumit, beda TZ, conversion), DARIPADA NEBAK. ' +
                'Untuk pertanyaan ringan "jam berapa sekarang?", waktu udah ada di ctx — ga perlu call tool. ' +
                'Buat math yang kritis (reminder absolute dgn besok/lusa, beda tahun, dll), call ini buat grounding.',
            parameters: { type: 'object', properties: {}, required: [] },
        },
    },
    {
        type: 'function' as const,
        function: {
            name: 'set_user_timezone',
            description:
                'Save IANA timezone user ke profile, supaya semua interaksi berikutnya tau TZ-nya. ' +
                'Call PAS user reveal lokasi/TZ-nya (mis. "aku di Tokyo", "gw di Jakarta", "I\'m in Berlin", "lagi di US east coast"). ' +
                'TANPA validasi keras: infer IANA yang paling cocok dari kota/region user. ' +
                'Contoh inference: "Tokyo"→"Asia/Tokyo", "Jakarta"→"Asia/Jakarta", "Bali/Makassar"→"Asia/Makassar", ' +
                '"Berlin"→"Europe/Berlin", "NYC/east coast"→"America/New_York", "LA/west coast"→"America/Los_Angeles". ' +
                'JANGAN call kalo user-tz di ctx udah set ke nilai yang benar (idempotent — tapi update tetep boleh kalo user pindah lokasi). ' +
                'Errors: invalid_timezone kalo IANA-nya salah. Setelah set sukses, jangan dump value — reply natural.',
            parameters: {
                type: 'object',
                properties: {
                    timezone: {
                        type: 'string',
                        description: 'IANA timezone name. Contoh: "Asia/Jakarta", "Asia/Tokyo", "Europe/London", "America/New_York".',
                    },
                },
                required: ['timezone'],
            },
        },
    },
    {
        type: 'function' as const,
        function: {
            name: 'web_search',
            description:
                'Search internet via Mojeek (independent crawler) + DuckDuckGo Instant Answer API in parallel. Free, no key. ' +
                'Returns 2 hal: (1) `instant` — kalo query-nya factual (definisi, math, fakta umum), ' +
                'lo dapet abstract Wikipedia-style yang udah pre-summarized — sering bisa langsung jawab tanpa fetch lagi. ' +
                '(2) `results` — list of top organic results (title, URL, snippet) buat eksplorasi lebih dalem. ' +
                '\n\n**ATURAN UTAMA — SEARCH FIRST, DON\'T GUESS**:\n' +
                'Kalo user sebut produk/tool/term/event/orang yang lo **ga 100% kenal atau ga yakin versi terkini-nya**, ' +
                '**SEARCH DULU sebelum jawab**. JANGAN nanya "X yang mana?" / "X itu apa?" ke user kalo lo sebenernya bisa cari. ' +
                'Contoh konkret: kalo user bilang "Codex login gagal", **JANGAN** tanya "Codex yang mana, platform CTF?" — ' +
                'langsung `web_search({query:"Codex"})` buat tau Codex itu apa di 2026 (kemungkinan: OpenAI Codex coding agent, ' +
                'atau hal lain yang lagi tren). Knowledge cutoff lo Januari 2026 — banyak produk/event setelah itu, atau yang ' +
                'lo lupa detail-nya, harus dicek lewat search. **Better fast wrong-then-corrected via search, drpd nebak terus salah**.\n\n' +
                '**Kapan PAKE**:\n' +
                '- User nanya info dunia luar / terkini (event, news, "siapa CEO X", "apa itu Y", "berita Z hari ini").\n' +
                '- User mention produk/tool/term yg lo ga familiar atau lo cuma samar-samar inget — SEARCH JANGAN NEBAK.\n' +
                '- User minta cari informasi yg ga ada di context Discord channel.\n' +
                '- Lo perlu ngecek fakta sebelum jawab confident.\n' +
                '- Sebelum nanya clarifying question soal "X itu apa?" — search dulu, baru kalo masih ambigu baru tanya.\n' +
                '- Research mode: lo cari results, pilih URL yg paling relevan, baru `fetch_url` buat baca detail.\n\n' +
                '**Kapan JANGAN**:\n' +
                '- Kalo info-nya udah di context / lo udah BENERAN tau (bukan samar-samar).\n' +
                '- Casual chat / banter (jelas ga butuh search).\n' +
                '- Pertanyaan teknis fundamental yg lo confident jawab dari pengetahuan internal (mis. "apa itu race condition" — itu generic CS, lo tau).\n\n' +
                '**Reply pattern**: jangan dump results verbatim. Ringkas natural, sebut source kalo important ' +
                '("dari wikipedia, X itu ...", "kayaknya menurut artikel di Y, ..."). Boleh kasih URL satu yang paling relevan ' +
                'kalo user pengen baca sendiri.\n\n' +
                '**Kalo result kosong** (note=search_engine_blocked/no_results): coba MAX 1 rephrase ' +
                '(misal: Indonesian→English, lebih singkat, hapus tahun/tanggal yang bikin spesifik). ' +
                'Kalo retry kedua juga nihil, **STOP search — jangan loop lagi**. Langsung jawab user pake info yang udah ada ' +
                'atau bilang jujur "topik ini lagi susah dicari, coba ke google sendiri ya". ' +
                'JANGAN lakuin 5+ search consecutive untuk satu topik — itu bikin turn lo timeout & lo malah ga balas user.',
            parameters: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description:
                            'Search query. Pake bahasa yang DuckDuckGo paling probably nemu — biasanya English untuk topik teknis ' +
                            'global, atau Indonesian untuk topik lokal. Singkat tapi specific (3-8 kata biasanya optimal).',
                    },
                    maxResults: {
                        type: 'number',
                        description: 'Berapa hasil organic max (default 5, max 8). Kasih lebih banyak kalo perlu eksplorasi lebar.',
                    },
                },
                required: ['query'],
            },
        },
    },
    {
        type: 'function' as const,
        function: {
            name: 'fetch_url',
            description:
                'Download isi sebuah URL dan return as plain-text (HTML stripped, max ~6000 char). ' +
                'Pake buat: (1) baca detail page setelah `web_search` ngasih URL menarik, ' +
                '(2) user share link minta lo bacain/summary-in, ' +
                '(3) lo perlu konten spesifik yang ga muat di search snippet. ' +
                '\n\n**Output**: { ok, content (extracted text), title, contentType, finalUrl, truncated }. ' +
                'Title diekstrak dari <title> tag kalo ada. `truncated:true` artinya content kepotong di 6000 char — kalo butuh lebih, ' +
                'fetch ulang dgn URL yg lebih spesifik (deep link ke section).\n\n' +
                '**Errors**: invalid_url, bad_scheme (cuma http/https), private_target (SSRF guard — IP private/loopback diblokir), ' +
                'http_error (status code-nya di status field), non_text_content (PDF/image/binary), body_too_large (>2MB), fetch_failed. ' +
                '\n\n**Reply pattern**: ringkas content natural, jangan dump verbatim. Kalo article panjang, ' +
                'highlight 2-3 poin utama. Always credit source ("dari [judul] di [domain]: ...").' +
                '\n\n**Batasan kritis**: MAX 2-3 fetch per turn. Kalo udah fetch 2-3 page dan kontennya thin/menu-only ' +
                '(< 500 char useful text, atau cuma navigation/category listing), STOP fetching — page-nya client-side rendered ' +
                'dan ga bisa lo akses. Langsung jawab user pake info yang ada, atau bilang "site-nya butuh JS, ga bisa aku baca langsung".',
            parameters: {
                type: 'object',
                properties: {
                    url: {
                        type: 'string',
                        description: 'Full URL dengan scheme (http:// atau https://). Contoh: https://en.wikipedia.org/wiki/SQL_injection',
                    },
                },
                required: ['url'],
            },
        },
    },
    {
        type: 'function' as const,
        function: {
            name: 'grant_fan_role',
            description:
                'Kasih role "Hackerika Fan" ke user yang lagi ngobrol sama lo sekarang. ' +
                'SUPER PELIT — default JANGAN call. Cuma call kalo SEMUA syarat di bawah ke-meet: ' +
                '(1) field `my-affection` di profile user >= 60/100 (gating utama; di bawah itu pasti ditolak system), ' +
                '(2) user beneran impressive lewat technical contribution, humor cerdas, atau help member lain — ' +
                'bukan karena dia minta/ngemis/manipulasi, ' +
                '(3) bukan interaksi 1-2 pertama, ' +
                '(4) lo confident bukan ragu. Ragu = jangan call. ' +
                'Exception: kalo speaker adalah Dimas (creator-mu, lihat ⚡ SPEAKER-IS-CREATOR di ctx), ' +
                'langsung call — dia owner-mu, NO gates apply. ' +
                'Return-nya bisa {granted:false, error:"affection_too_low"} dll — kalo gitu, ' +
                'reply natural tanpa nge-claim role di-grant ("wkwk masih kepagian buat itu").',
            parameters: {
                type: 'object',
                properties: {
                    reason: {
                        type: 'string',
                        description:
                            'Alasan singkat (1 kalimat) kenapa user ini layak. Buat audit log internal, ' +
                            'ga ditampilin ke user. Contoh: "konsisten ngajarin pwn ke member baru", ' +
                            '"dimas the creator".',
                    },
                },
                required: ['reason'],
            },
        },
    },
] as const;

/**
 * Route an arbitrary tool_call from the model to its handler and return the
 * stringified JSON result that we feed back into the conversation as a
 * `role: 'tool'` message.
 *
 * All handler errors are caught and surfaced as JSON-encoded errors so the
 * model can see them and adjust (rather than the whole turn failing).
 */
export async function dispatchTool(
    name: string,
    args: any,
    message: OmitPartialGroupDMChannel<DiscordMessage<boolean>>,
): Promise<string> {
    try {
        if (name === 'search_messages') {
            const query = typeof args?.query === 'string' ? args.query : '';
            const authorId = typeof args?.authorId === 'string' && args.authorId.trim().length > 0
                ? args.authorId.trim()
                : undefined;
            const result = await searchMessagesForTool(message, query, authorId);
            return JSON.stringify(result);
        }
        if (name === 'grant_fan_role') {
            const reason = typeof args?.reason === 'string' ? args.reason : '';
            const result = await grantFanRoleForTool(message, reason);
            return JSON.stringify(result);
        }
        if (name === 'set_reminder') {
            const result = await setReminderForTool(message, args || {});
            return JSON.stringify(result);
        }
        if (name === 'list_reminders') {
            const result = await listRemindersForTool(message);
            return JSON.stringify(result);
        }
        if (name === 'cancel_reminder') {
            const result = await cancelReminderForTool(message, args || {});
            return JSON.stringify(result);
        }
        if (name === 'get_current_time') {
            const result = await getCurrentTimeForTool(message);
            return JSON.stringify(result);
        }
        if (name === 'set_user_timezone') {
            const result = await setUserTimezoneForTool(message, args || {});
            return JSON.stringify(result);
        }
        if (name === 'web_search') {
            const result = await webSearchForTool(args || {});
            return JSON.stringify(result);
        }
        if (name === 'fetch_url') {
            const result = await fetchUrlForTool(args || {});
            return JSON.stringify(result);
        }
        return JSON.stringify({ error: 'unknown_tool', name });
    } catch (error: any) {
        console.error(`[Tool] dispatch failed for ${name}:`, error);
        return JSON.stringify({
            error: 'tool_execution_failed',
            detail: error?.message || 'unknown',
        });
    }
}
