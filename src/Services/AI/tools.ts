import { OmitPartialGroupDMChannel, Message as DiscordMessage } from "discord.js";
import { searchMessagesForTool, recallMemoryForTool } from "./search";
import { grantFanRoleForTool } from "./fanRole";
import {
    setReminderForTool,
    listRemindersForTool,
    cancelReminderForTool,
    getCurrentTimeForTool,
    setUserTimezoneForTool,
} from "./reminders";
import { webSearchForTool, fetchUrlForTool } from "./web";
import {
    createTaskForTool,
    listTasksForTool,
    updateTaskForTool,
    completeTaskForTool,
} from "./tasks";

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
                'KEYWORD search di pesan lama channel ini (exact word/phrase match). Pakai kalo lo butuh EXACT TOKENS — CVE IDs, file names, nick spesifik, code fragments, URL paths, technical terms persis. ' +
                'Buat query yang lebih fuzzy/semantik (mis. "ada yang pernah bahas cookie security?" — paraphrased), pake `recall_memory` instead. ' +
                'Reach: ~90 hari indexed + tier fallback ke Discord API. Returns ≤8 matches diranking by recency + importance.',
            parameters: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description:
                            'Keyword AND-match (case-insensitive). Multi-word phrase di "double quote". Boleh "" kalo cuma filter by authorId.',
                    },
                    authorId: {
                        type: 'string',
                        description:
                            'Optional Discord user ID (digit-only, TANPA <@>). Extract dari mention user (mis. "<@663..>" → "663.."). ' +
                            'Pake ini buat filter by author, bukan substring di content.',
                    },
                },
                required: ['query'],
            },
        },
    },
    {
        type: 'function' as const,
        function: {
            name: 'recall_memory',
            description:
                'SEMANTIC recall di pesan lama channel ini (vector embedding similarity). Beda dari `search_messages` yang exact-keyword: ' +
                'ini ngerti PARAPHRASE — "ada yg pernah bahas cookie security?" bakal nemu thread soal "session token" / "XSS exfil" walau kata "cookie" ga muncul. ' +
                'Pake kalo lo: (1) cari topik/konsep lewat — bukan kata persis, (2) recall "kita pernah ngomong soal X kan?", (3) topik tematis yang bisa diomongin pake banyak cara. ' +
                'Buat exact-token search (CVE-2026-xxxx, file path, nick spesifik), pake `search_messages` instead. ' +
                'Returns ≤8 matches dgn similarity 0-1, ranked by combined score (semantic 50% + recency 30% + importance 20%).',
            parameters: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description:
                            'Natural-language description of what you remember/seek. ' +
                            'Tulis kayak lo bakal jelasin ke teman — sentence/phrase, bukan keyword list. ' +
                            'Contoh: "diskusi soal race condition di web", "saat user A ngajarin pwn trick", "candaan soal durian skill issue".',
                    },
                    authorId: {
                        type: 'string',
                        description: 'Optional Discord user ID (digit-only, no <@>). Restricts recall to messages by this author.',
                    },
                    limit: {
                        type: 'number',
                        description: 'Max results (default 5, max 8).',
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
                'Schedule reminder untuk caller (self-only). Sistem kirim "🔔 <@user> <content>" ke channel ini pas waktunya. ' +
                'Wajib provide EITHER `whenISO` OR `relativeMinutes`. ' +
                'Buat `whenISO`: ISO 8601 dengan offset TZ user dari ctx (mis. user-tz=Asia/Jakarta + "besok jam 9 pagi" → `"2026-05-19T09:00:00+07:00"`). ' +
                'Confirm reply pake user-local time, bukan ISO. Errors: past_time/too_far_future/quota_exceeded — reply natural.',
            parameters: {
                type: 'object',
                properties: {
                    content: {
                        type: 'string',
                        description: 'Body pesan reminder, gaya santai natural, max ~500 char.',
                    },
                    whenISO: {
                        type: 'string',
                        description: 'ISO 8601 absolut dengan offset TZ user (e.g. "2026-05-19T09:00:00+07:00"). Pake buat waktu spesifik.',
                    },
                    relativeMinutes: {
                        type: 'number',
                        description: 'Offset menit dari sekarang, float OK ("30 menit lagi"→30, "1.5 jam"→90, "30 detik"→0.5).',
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
                'List reminder aktif (belum delivered) milik caller. Pake kalo user nanya "remindermu apa aja". ' +
                'Ringkas natural, jangan dump JSON. Inget reminderId buat next-turn cancel.',
            parameters: { type: 'object', properties: {}, required: [] },
        },
    },
    {
        type: 'function' as const,
        function: {
            name: 'cancel_reminder',
            description:
                'Cancel reminder pending milik caller. WAJIB tau reminderId (call list_reminders kalo belum). Tool tolak kalo not_yours/already_delivered.',
            parameters: {
                type: 'object',
                properties: {
                    reminderId: {
                        type: 'string',
                        description: 'MongoDB ObjectId 24-hex dari list_reminders.',
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
                'Get waktu UTC + TZ user + format lokal. Pake kalo BENERAN ga yakin math waktu (besok/lusa, beda TZ, conversion). ' +
                'Buat "jam berapa sekarang?" ringan — waktu udah di ctx, ga perlu call.',
            parameters: { type: 'object', properties: {}, required: [] },
        },
    },
    {
        type: 'function' as const,
        function: {
            name: 'set_user_timezone',
            description:
                'Save IANA timezone user ke profile. Call pas user reveal lokasi-nya ("aku di Tokyo" / "I\'m in Berlin"). ' +
                'Infer IANA yang cocok: "Tokyo"→"Asia/Tokyo", "Jakarta"→"Asia/Jakarta", "Berlin"→"Europe/Berlin", "NYC/east coast"→"America/New_York", "LA/west"→"America/Los_Angeles". ' +
                'JANGAN call kalo user-tz di ctx udah benar (idempotent). Errors: invalid_timezone.',
            parameters: {
                type: 'object',
                properties: {
                    timezone: {
                        type: 'string',
                        description: 'IANA timezone name (e.g. "Asia/Jakarta", "America/New_York").',
                    },
                },
                required: ['timezone'],
            },
        },
    },
    {
        type: 'function' as const,
        function: {
            name: 'create_task',
            description:
                'Register a persistent TASK for the caller — different from set_reminder! ' +
                'Tasks = ongoing work lo track across sessions (multi-step, has notes, status, optional recurring follow-up). ' +
                'Reminders = atomic one-shot timed pings. ' +
                'Pake create_task pas user voice intent yang multi-step / open-ended ("aku mau ningkatin pwn", "bantu gw prep DEF CON quals", "ingetin gw weekly soal X"). ' +
                'Once created, lo bisa proaktif follow-up daily via cron (system handle ini — lo ga perlu khawatir scheduling). ' +
                'Quota: 20 active tasks per user.',
            parameters: {
                type: 'object',
                properties: {
                    description: {
                        type: 'string',
                        description: 'Natural-language description of the task in your voice. Max 300 char. Contoh: "improve pwn skill", "weekly CVE digest", "prep buat DEF CON quals 2026".',
                    },
                    dueAtISO: {
                        type: 'string',
                        description: 'Optional ISO 8601 deadline with user-TZ offset. Skip kalo task open-ended.',
                    },
                    recurrence: {
                        type: 'string',
                        enum: ['none', 'daily', 'weekly', 'biweekly', 'monthly'],
                        description: 'Optional follow-up cadence (default "none"). Pake weekly/biweekly buat ongoing check-ins.',
                    },
                    initialNote: {
                        type: 'string',
                        description: 'Optional first note jotting down context. Max 300 char.',
                    },
                },
                required: ['description'],
            },
        },
    },
    {
        type: 'function' as const,
        function: {
            name: 'list_tasks',
            description:
                'List active tasks for the caller. Default returns pending + in_progress. Pake kalo user nanya "tasks gw apa aja?", atau lo perlu inventory context. ' +
                'Returns: taskId, description, status, recurrence, dueAt, lastWorkedOn, notes count. Ringkas natural, jangan dump JSON.',
            parameters: {
                type: 'object',
                properties: {
                    status: {
                        type: 'string',
                        enum: ['pending', 'in_progress', 'done', 'cancelled'],
                        description: 'Optional filter; defaults to active (pending + in_progress).',
                    },
                    limit: {
                        type: 'number',
                        description: 'Max results (default 10, max 20).',
                    },
                },
                required: [],
            },
        },
    },
    {
        type: 'function' as const,
        function: {
            name: 'update_task',
            description:
                'Update a task: add a progress note or change status. Pake kalo user share update soal task yang udah ada ("gw udah selesai modul 1 nih"), atau lo natural inget pas conversation nyentuh topic-nya. ' +
                'WAJIB tau taskId (call list_tasks dulu kalo belum). Note di-append (max 20 per task, oldest dropped).',
            parameters: {
                type: 'object',
                properties: {
                    taskId: {
                        type: 'string',
                        description: 'MongoDB ObjectId 24-hex from list_tasks.',
                    },
                    addNote: {
                        type: 'string',
                        description: 'Optional progress note to append. Max 300 char.',
                    },
                    status: {
                        type: 'string',
                        enum: ['pending', 'in_progress', 'done', 'cancelled'],
                        description: 'Optional status change.',
                    },
                },
                required: ['taskId'],
            },
        },
    },
    {
        type: 'function' as const,
        function: {
            name: 'complete_task',
            description:
                'Mark a task as done. Pake pas user explicitly bilang udah selesai/achieved goal-nya, atau lo confident from context. ' +
                'Shortcut for update_task({status:"done"}). Closes the task — cron berhenti follow-up.',
            parameters: {
                type: 'object',
                properties: {
                    taskId: {
                        type: 'string',
                        description: 'MongoDB ObjectId 24-hex from list_tasks.',
                    },
                },
                required: ['taskId'],
            },
        },
    },
    {
        type: 'function' as const,
        function: {
            name: 'web_search',
            description:
                'Search internet via Mojeek + DuckDuckGo Instant Answer in parallel. Free, no key. ' +
                'Returns `instant` (Wikipedia-style abstract for factual queries) dan/atau `results` (top organic hits dengan title/URL/snippet).\n\n' +
                '**Lihat section EPISTEMIC HUMILITY di system prompt untuk aturan SEARCH-FIRST.** ' +
                'Singkatnya: kalo user mention produk/tool/event yang lo ga 100% kenal, SEARCH DULU sebelum jawab atau nanya "X yg mana?".\n\n' +
                '**Kapan JANGAN**: info udah di context / fundamental CS concepts evergreen / casual banter.\n' +
                '**Reply pattern**: ringkas natural, sebut source. Boleh kasih 1 URL paling relevan.\n' +
                '**Kalo result kosong** (note=search_engine_blocked/no_results): MAX 1 rephrase (ID↔EN, lebih singkat). ' +
                'Tetep nihil → STOP, jawab pake info yang ada atau bilang "topik ini susah dicari, coba ke google". JANGAN 5+ search consecutive.',
            parameters: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: 'Search query, 3-8 kata optimal. English untuk topik teknis global, Indonesian untuk lokal.',
                    },
                    maxResults: {
                        type: 'number',
                        description: 'Max organic results (default 5, max 8).',
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
                'Download URL → plain-text (HTML stripped, max ~6000 char). Pake buat baca detail setelah web_search, atau kalo user share link minta dibaca. ' +
                'Output: `{ok, content, title, contentType, finalUrl, truncated}`. ' +
                'Errors: invalid_url/bad_scheme/private_target/http_error/non_text_content/body_too_large/fetch_failed.\n' +
                'Reply pattern: ringkas, credit source ("dari [judul] di [domain]: ...").\n' +
                '**MAX 2-3 fetch per turn**. Kalo content thin/menu-only setelah 2-3 page, STOP — kemungkinan client-rendered. ' +
                'Bilang "site-nya butuh JS, ga bisa aku baca langsung".',
            parameters: {
                type: 'object',
                properties: {
                    url: {
                        type: 'string',
                        description: 'Full URL dengan http(s) scheme.',
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
                'Kasih role "Hackerika Fan" ke caller. **SUPER PELIT — default JANGAN call.** Lihat section DIMAS + ROLE rules di system prompt untuk gates. ' +
                'Singkatnya: hanya call kalo (a) affection >= 60/100 (range -100..100; negative = actively cooled, JAUH dari eligible — definitely don\'t call), (b) user impressive organik (bukan minta/manipulasi), (c) bukan interaksi 1-2 pertama, (d) lo confident. ' +
                'Exception: kalo speaker Dimas (⚡ SPEAKER-IS-CREATOR di ctx) → langsung call, NO gates. ' +
                'Result bisa `{granted:false, error:"..."}` (affection_too_low, cooldown_active, dll) → reply natural tanpa nge-claim ("wkwk masih kepagian").',
            parameters: {
                type: 'object',
                properties: {
                    reason: {
                        type: 'string',
                        description: 'Alasan singkat 1 kalimat (audit log internal, ga ditampilin user).',
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
        if (name === 'recall_memory') {
            const result = await recallMemoryForTool(message, args || {});
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
        if (name === 'create_task') {
            const result = await createTaskForTool(message, args || {});
            return JSON.stringify(result);
        }
        if (name === 'list_tasks') {
            const result = await listTasksForTool(message, args || {});
            return JSON.stringify(result);
        }
        if (name === 'update_task') {
            const result = await updateTaskForTool(message, args || {});
            return JSON.stringify(result);
        }
        if (name === 'complete_task') {
            const result = await completeTaskForTool(message, args || {});
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
