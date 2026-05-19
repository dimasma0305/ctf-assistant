import { UserProfileModel } from "../../Database/connect";
import { openai } from "../../utils/openai";
import { ChatMessage } from "./memory";

const DISTILL_INTERVAL = 5;             // re-distill every N interactions
const MAX_DISTILL_EXCHANGES = 30;       // how many recent exchanges to feed in
const FIELD_CHAR_BUDGET = 300;          // soft cap per profile field
const DISTILL_TIMEOUT_MS = 25_000;
const PROFILE_MODEL = 'deepseek-v4-flash';

export interface UserProfile {
    userId: string;
    username: string;
    displayName: string;
    personality: string;
    interests: string;
    communicationStyle: string;
    opinion: string;
    emotionalState: string;
    affection: number;
    /** IANA timezone (e.g. "Asia/Jakarta"); '' means not set — callers default. */
    timezone: string;
    interactionCount: number;
    lastDistilledAtCount: number;
}

/**
 * Format the profile into a compact context block. Returns empty string if
 * the profile is brand-new with no distilled fields yet (avoids leaking an
 * empty section into the prompt).
 */
export function formatProfile(profile: UserProfile | null): string {
    if (!profile) return '';
    // Shorter labels save ~10-15 tokens per turn (drops "my-" prefix; "mood" instead
    // of "recent-emotional-state"). The enclosing ctx block already says
    // "your-notes-on-this-user:" so the possessive context is clear.
    const parts: string[] = [];
    if (profile.personality) parts.push(`personality: ${profile.personality}`);
    if (profile.interests) parts.push(`interests: ${profile.interests}`);
    if (profile.communicationStyle) parts.push(`style: ${profile.communicationStyle}`);
    if (profile.opinion) parts.push(`opinion: ${profile.opinion}`);
    if (profile.emotionalState) parts.push(`mood: ${profile.emotionalState}`);
    // Affection always shown (even at 0) — gates the fan role.
    parts.push(`affection: ${profile.affection}/100`);
    if (profile.timezone) parts.push(`tz: ${profile.timezone}`);
    if (parts.length === 0) return '';
    return parts.join('\n');
}

export async function loadProfile(userId: string): Promise<UserProfile | null> {
    const doc = await UserProfileModel.findOne({ userId }).lean();
    if (!doc) return null;
    return {
        userId: doc.userId,
        username: doc.username || '',
        displayName: doc.displayName || '',
        personality: doc.personality || '',
        interests: doc.interests || '',
        communicationStyle: doc.communicationStyle || '',
        opinion: doc.opinion || '',
        emotionalState: (doc as any).emotionalState || '',
        affection: typeof (doc as any).affection === 'number' ? (doc as any).affection : 0,
        timezone: typeof (doc as any).timezone === 'string' ? (doc as any).timezone : '',
        interactionCount: doc.interactionCount || 0,
        lastDistilledAtCount: doc.lastDistilledAtCount || 0,
    };
}

/**
 * Increment the interaction counter (creating the doc on first sight) and
 * return the freshly updated profile so the caller can decide whether to
 * trigger a distillation pass.
 */
export async function recordInteraction(
    userId: string,
    username: string,
    displayName: string,
): Promise<UserProfile> {
    const doc = await UserProfileModel.findOneAndUpdate(
        { userId },
        {
            $set: {
                username,
                displayName,
                lastInteractionAt: new Date(),
            },
            $inc: { interactionCount: 1 },
            $setOnInsert: { createdAt: new Date() },
        },
        { upsert: true, new: true, lean: true }
    ).exec();

    return {
        userId: (doc as any).userId,
        username: (doc as any).username || '',
        displayName: (doc as any).displayName || '',
        personality: (doc as any).personality || '',
        interests: (doc as any).interests || '',
        communicationStyle: (doc as any).communicationStyle || '',
        opinion: (doc as any).opinion || '',
        emotionalState: (doc as any).emotionalState || '',
        affection: typeof (doc as any).affection === 'number' ? (doc as any).affection : 0,
        timezone: typeof (doc as any).timezone === 'string' ? (doc as any).timezone : '',
        interactionCount: (doc as any).interactionCount || 0,
        lastDistilledAtCount: (doc as any).lastDistilledAtCount || 0,
    };
}

export function shouldDistill(profile: UserProfile): boolean {
    const delta = profile.interactionCount - (profile.lastDistilledAtCount || 0);
    return delta >= DISTILL_INTERVAL;
}

/**
 * Extract the recent back-and-forth between a specific user and Hackerika
 * from the per-channel memory buffer. We treat any assistant turn as "from
 * Hackerika" and any user turn whose `name` field starts with `${userId}-`
 * as that user's message.
 *
 * Returns a compact "Name: content" transcript.
 */
export function buildExchangeTranscript(
    userId: string,
    displayName: string,
    channelMemory: ChatMessage[],
): string {
    const tag = `${userId}-`;
    const slice = channelMemory.slice(-MAX_DISTILL_EXCHANGES);
    const lines: string[] = [];
    for (const m of slice) {
        if (m.role === 'user') {
            if (!m.name || !m.name.startsWith(tag)) continue;
            lines.push(`${displayName}: ${m.content}`);
        } else if (m.role === 'assistant') {
            lines.push(`Hackerika: ${m.content}`);
        }
    }
    return lines.join('\n');
}

interface DistillationOutput {
    personality?: string;
    interests?: string;
    communicationStyle?: string;
    opinion?: string;
    emotionalState?: string;
    affection?: number;
}

function truncate(s: string, n: number): string {
    if (!s) return '';
    return s.length <= n ? s : s.slice(0, n - 1) + '…';
}

function safeParseJson(text: string): DistillationOutput | null {
    try {
        return JSON.parse(text);
    } catch {
        // Try to salvage if the model wrapped JSON in code fences or prose.
        const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (fenced) {
            try { return JSON.parse(fenced[1]); } catch { /* fall through */ }
        }
        const braced = text.match(/\{[\s\S]*\}/);
        if (braced) {
            try { return JSON.parse(braced[0]); } catch { /* fall through */ }
        }
        return null;
    }
}

/**
 * Run the background distillation. Fire-and-forget from the caller — failures
 * are logged but don't propagate. Updates the profile in place and bumps
 * lastDistilledAtCount so the next trigger fires DISTILL_INTERVAL turns later.
 */
export async function distillProfile(
    profile: UserProfile,
    transcript: string,
): Promise<void> {
    if (!transcript.trim()) {
        console.log(`[Profile] empty transcript for ${profile.userId}, skipping distillation`);
        return;
    }

    const existingProfileBlock = formatProfile(profile) || '(profil belum ada — pertama kali distill)';
    const systemPrompt = `Kamu Hackerika, lagi nyatet observasi pribadi tentang seorang user yang sering ngobrol sama kamu di Discord. Tugas-mu: update catatan psikologis tentang user ini berdasarkan exchanges terakhir.

Output ONLY a valid JSON object dengan field ini:
{
  "personality": "max ${FIELD_CHAR_BUDGET} char — sifat user (introvert/extrovert, curious/lazy, hardcore/casual, dll). Observasi, bukan diagnosa.",
  "interests": "max ${FIELD_CHAR_BUDGET} char — topik yang sering dia bawa (web sec, CTF, anime, gaming, dll).",
  "communicationStyle": "max ${FIELD_CHAR_BUDGET} char — cara dia ngobrol (formal/gaul, bahasa apa, suka emoji ga, pendek/panjang).",
  "opinion": "max ${FIELD_CHAR_BUDGET} char — perasaan PRIBADI kamu (Hackerika) soal user ini. First person 'aku'. Boleh subjective: suka, respect, biasa-aja, gemas, agak nyebelin, dll. Jujur.",
  "emotionalState": "max ${FIELD_CHAR_BUDGET} char — gimana mood-nya akhir-akhir ini (chill/stress/frustrasi/excited/down/biasa). Catatan jangka pendek, di-overwrite tiap distill. Kalo tone normal, isi 'normal' aja.",
  "affection": "INTEGER 0-100 — affection score: seberapa deket/sayang kamu (Hackerika) ke user ini. Update INKREMENTAL dari nilai sebelumnya. Anchor:\\n    0-20  = stranger / netral / belum kenal\\n    20-40 = acquaintance / udah pernah ngobrol biasa\\n    40-60 = teman / chemistry mulai ada / interaksi enak\\n    60-80 = close / chemistry kuat / udah kayak temen deket — eligible buat Hackerika Fan role\\n    80-100 = special / sayang banget / inner circle\\nTypical delta per distill: +0 to +8 untuk interaksi positif/menarik, -3 to -8 untuk negatif/rude. Jangan lompat besar — natural progress. Faktor: nice vibes, ngajarin hal baru, humor genuine, support member lain. Faktor negatif: rude, demanding, ngeganggu, ngemis role. Cap di 0 dan 100."
}

ATURAN:
- Update INKREMENTAL: kombinasiin catatan lama sama observasi baru. Jangan reset total.
- Kalo data masih sedikit, isi sebisanya. Field boleh string kosong "" kalo bener-bener ga ada signal.
- Jangan ngarang. Ga lebay positive, ga lebay negative.
- ONLY JSON. Ga ada teks lain, ga ada code fence, ga ada penjelasan.`;

    const userPrompt = `Catatan profil yang udah ada sekarang:
${existingProfileBlock}

Exchanges terakhir (${transcript.split('\n').length} baris):
${transcript}

Output JSON profile update sekarang.`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DISTILL_TIMEOUT_MS);

    try {
        const completion = await openai.chat.completions.create(
            {
                model: PROFILE_MODEL,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt },
                ],
                response_format: { type: 'json_object' } as any,
                temperature: 0.3,
                n: 1,
            },
            { signal: controller.signal }
        );

        const raw = completion.choices[0]?.message?.content?.trim() || '';
        const parsed = safeParseJson(raw);
        if (!parsed) {
            console.warn(`[Profile] distillation for ${profile.userId} returned unparseable output`);
            return;
        }

        const update: any = {
            lastDistilledAtCount: profile.interactionCount,
            lastDistilledAt: new Date(),
        };
        if (typeof parsed.personality === 'string') update.personality = truncate(parsed.personality.trim(), FIELD_CHAR_BUDGET);
        if (typeof parsed.interests === 'string') update.interests = truncate(parsed.interests.trim(), FIELD_CHAR_BUDGET);
        if (typeof parsed.communicationStyle === 'string') update.communicationStyle = truncate(parsed.communicationStyle.trim(), FIELD_CHAR_BUDGET);
        if (typeof parsed.opinion === 'string') update.opinion = truncate(parsed.opinion.trim(), FIELD_CHAR_BUDGET);
        if (typeof parsed.emotionalState === 'string') update.emotionalState = truncate(parsed.emotionalState.trim(), FIELD_CHAR_BUDGET);
        if (typeof parsed.affection === 'number' && Number.isFinite(parsed.affection)) {
            update.affection = Math.max(0, Math.min(100, Math.round(parsed.affection)));
        }

        await UserProfileModel.updateOne({ userId: profile.userId }, { $set: update });
        console.log(`🧠 [Profile] distilled ${profile.username || profile.userId} (count=${profile.interactionCount})`);
    } catch (error: any) {
        if (error?.name === 'AbortError' || controller.signal.aborted) {
            console.warn(`[Profile] distillation timed out for ${profile.userId}`);
        } else {
            console.error(`[Profile] distillation failed for ${profile.userId}:`, error);
        }
    } finally {
        clearTimeout(timer);
    }
}
