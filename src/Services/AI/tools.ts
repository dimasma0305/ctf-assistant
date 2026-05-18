import { OmitPartialGroupDMChannel, Message as DiscordMessage } from "discord.js";
import { searchMessagesForTool } from "./search";
import { grantFanRoleForTool } from "./fanRole";

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
        return JSON.stringify({ error: 'unknown_tool', name });
    } catch (error: any) {
        console.error(`[Tool] dispatch failed for ${name}:`, error);
        return JSON.stringify({
            error: 'tool_execution_failed',
            detail: error?.message || 'unknown',
        });
    }
}
