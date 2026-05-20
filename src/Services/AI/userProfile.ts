import { UserProfileModel } from "../../Database/connect";
import { openai } from "../../utils/openai";
import { ChatMessage } from "./memory";

const DISTILL_INTERVAL = 5;             // re-distill every N interactions
const MAX_DISTILL_EXCHANGES = 30;       // how many recent exchanges to feed in
const FIELD_CHAR_BUDGET = 300;          // soft cap per profile field
const MOMENT_CHAR_BUDGET = 160;         // soft cap per moment summary
const MAX_MOMENTS = 8;                   // ring-buffer cap; oldest evicted
const MIN_RELATIONSHIP_VALUE = -100;     // floor for affection + 4 dims (matches schema)
const MAX_RELATIONSHIP_VALUE = 100;      // ceiling for affection + 4 dims
const MAX_DISPLAYED_MOMENTS = 4;         // how many we surface in the per-turn ctx (most recent)
const DISTILL_TIMEOUT_MS = 25_000;
const PROFILE_MODEL = 'deepseek-v4-flash';

const VALID_MOMENT_TONES = new Set(['fun', 'helpful', 'touching', 'tense', 'impressive']);
export type MomentTone = 'fun' | 'helpful' | 'touching' | 'tense' | 'impressive';

export interface Moment {
    summary: string;
    tone: MomentTone;
    createdAt: Date;
}

export interface UserProfile {
    userId: string;
    username: string;
    displayName: string;
    personality: string;
    interests: string;
    communicationStyle: string;
    opinion: string;
    emotionalState: string;
    /** Overall warmth, 0-100. Also the fan-role gate + vulnerability-tier gate. */
    affection: number;
    /** Snapshot from previous distillation (for trajectory delta). */
    previousAffection: number;
    /** Four independent relationship dimensions, all 0-100. */
    trust: number;
    respect: number;
    comfort: number;
    chemistry: number;
    /** Memorable specific exchanges, ring-buffered to MAX_MOMENTS. */
    moments: Moment[];
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
function relativeAge(d: Date | string | undefined): string {
    if (!d) return '';
    const t = (d instanceof Date ? d : new Date(d)).getTime();
    if (!Number.isFinite(t)) return '';
    const diffMs = Date.now() - t;
    const days = Math.floor(diffMs / 86_400_000);
    if (days <= 0) {
        const hours = Math.floor(diffMs / 3_600_000);
        return hours <= 0 ? 'just now' : `${hours}h ago`;
    }
    if (days < 14) return `${days}d ago`;
    const weeks = Math.floor(days / 7);
    return `${weeks}w ago`;
}

export function formatProfile(profile: UserProfile | null): string {
    if (!profile) return '';
    // Compact one-line-per-field format. Short labels (drop "my-" prefix; "mood"
    // instead of "recent-emotional-state"). The enclosing ctx block already says
    // "your-notes-on-this-user:" so possessive context is clear.
    const parts: string[] = [];
    if (profile.personality) parts.push(`personality: ${profile.personality}`);
    if (profile.interests) parts.push(`interests: ${profile.interests}`);
    if (profile.communicationStyle) parts.push(`style: ${profile.communicationStyle}`);
    if (profile.opinion) parts.push(`opinion: ${profile.opinion}`);
    if (profile.emotionalState) parts.push(`mood: ${profile.emotionalState}`);

    // Affection with trajectory delta (always shown — gates fan role + vulnerability).
    const delta = profile.affection - (profile.previousAffection || 0);
    const trajectory =
        Math.abs(delta) >= 1 ? ` (${delta > 0 ? '+' : ''}${delta} since last)` : '';
    parts.push(`affection: ${profile.affection}/100${trajectory}`);

    // 4 dimensions on one line — compact, only shown when any have moved off 0
    // (avoids noise for brand-new profiles).
    if (profile.trust || profile.respect || profile.comfort || profile.chemistry) {
        parts.push(
            `dims: trust=${profile.trust} respect=${profile.respect} ` +
            `comfort=${profile.comfort} chemistry=${profile.chemistry}`,
        );
    }

    // Moments: surface only the most recent N. Each line: "Nd ago [tone]: summary"
    if (profile.moments && profile.moments.length > 0) {
        const recent = profile.moments
            .slice() // copy
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(0, MAX_DISPLAYED_MOMENTS);
        const lines = recent.map((m) => `- ${relativeAge(m.createdAt)} [${m.tone}]: ${m.summary}`);
        parts.push(`moments:\n${lines.join('\n')}`);
    }

    if (profile.timezone) parts.push(`tz: ${profile.timezone}`);
    if (parts.length === 0) return '';
    return parts.join('\n');
}

function hydrateProfile(doc: any): UserProfile {
    const rawMoments = Array.isArray(doc?.moments) ? doc.moments : [];
    const moments: Moment[] = rawMoments
        .filter((m: any) => m && typeof m.summary === 'string' && m.summary.trim().length > 0)
        .map((m: any) => ({
            summary: m.summary,
            tone: VALID_MOMENT_TONES.has(m.tone) ? (m.tone as MomentTone) : 'fun',
            createdAt: m.createdAt ? new Date(m.createdAt) : new Date(),
        }));
    return {
        userId: doc.userId,
        username: doc.username || '',
        displayName: doc.displayName || '',
        personality: doc.personality || '',
        interests: doc.interests || '',
        communicationStyle: doc.communicationStyle || '',
        opinion: doc.opinion || '',
        emotionalState: doc.emotionalState || '',
        affection: typeof doc.affection === 'number' ? doc.affection : 0,
        previousAffection: typeof doc.previousAffection === 'number' ? doc.previousAffection : 0,
        trust: typeof doc.trust === 'number' ? doc.trust : 0,
        respect: typeof doc.respect === 'number' ? doc.respect : 0,
        comfort: typeof doc.comfort === 'number' ? doc.comfort : 0,
        chemistry: typeof doc.chemistry === 'number' ? doc.chemistry : 0,
        moments,
        timezone: typeof doc.timezone === 'string' ? doc.timezone : '',
        interactionCount: doc.interactionCount || 0,
        lastDistilledAtCount: doc.lastDistilledAtCount || 0,
    };
}

export async function loadProfile(userId: string): Promise<UserProfile | null> {
    const doc = await UserProfileModel.findOne({ userId }).lean();
    if (!doc) return null;
    return hydrateProfile(doc);
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

    return hydrateProfile(doc);
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
    trust?: number;
    respect?: number;
    comfort?: number;
    chemistry?: number;
    /** 0-2 newly-noticed memorable exchanges from these last turns. */
    newMoments?: Array<{ summary?: string; tone?: string }>;
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
  "affection": "INTEGER -100..100 — OVERALL WARMTH composite. Update INKREMENTAL. Anchor: -100..-30 actively hostile / banned-from-my-warmth, -30..-10 annoyed / cold / minimum effort, -10..0 friction slight cooling, 0-20 stranger / neutral, 20-40 acquaintance, 40-60 friend, 60-80 close (fan-eligible), 80-100 inner circle. Typical delta per distill: +0..+8 positif, -3..-8 negatif. Cap [-100,100]. Default = 0 (neutral). Jangan lompat besar.",
  "trust":     "INTEGER -100..100 — TRUST. Apakah aku percaya dia genuine/konsisten/honest? Naik dari: keterbukaan, predictability, jujur ngakuin salah. Turun dari: deception, mood flip-flop, manipulasi. Negative = aku actively distrust (ketauan bohong/manipulatif). Cap [-100,100].",
  "respect":   "INTEGER -100..100 — RESPECT. Apakah aku value contribution dia (teknis, intelektual, help member)? Naik dari: insight tajam, ngajarin hal baru, konsisten bantuin orang. Turun dari: dunning-kruger, asal nyolot tanpa substansi. Negative = aku actively dismissive of them. Cap [-100,100].",
  "comfort":   "INTEGER -100..100 — COMFORT. Apakah aku santai bisa jadi diri-sendiri sama dia? Naik dari: low friction, banter natural, predictable warm. Turun dari: intimidating vibes, judgmental, awkward energy. Negative = weird/creepy vibes / boundary-pushing bikin aku ga nyaman. Cap [-100,100].",
  "chemistry": "INTEGER -100..100 — CHEMISTRY. Banter/humor fit. Naik dari: jokes nyambung, tone sinkron, callback humor jalan, riff-on. Turun dari: humor maksa, garing terus, tone mismatch chronic. Negative = humor mereka actively bikin aku cringe / ga nyambung total. Cap [-100,100].",
  "newMoments": "ARRAY of 0-2 objects, each { summary: '<max ${MOMENT_CHAR_BUDGET} char>', tone: 'fun'|'helpful'|'touching'|'tense'|'impressive' }. ONLY include kalo ada exchange yang BENERAN distinctive dan worth callback later (mis. joke spesifik, teaching moment, conflict-then-repair, vulnerability moment, impressive solve). Kalo ga ada yang stand out, return []. Jangan paksain."
}

ATURAN:
- Update INKREMENTAL: kombinasiin catatan lama sama observasi baru. Jangan reset total.
- 4 dimensi (trust/respect/comfort/chemistry) jalan INDEPENDEN — bisa beda-beda nilainya per user. Same +0..+8 / -3..-8 incremental anchors per dimensi.
- **Negative values are REAL signals**. Kalo user persistent rude / manipulative / role-begging / spammy → score-nya CAN drop below 0. Same +0..+8 / -3..-8 deltas, floor di -100. Negative = aku actively cooled, bukan cuma "stranger / neutral". JANGAN reset ke 0 cuma karena user yang sebelumnya negatif baru ngomong satu kalimat netral — incremental aja.
- Kalo data masih sedikit, isi sebisanya. String field boleh "" kalo emang ga ada signal. Numeric default 0.
- newMoments cuma diisi kalo BENERAN ada moment yang stand out. Default empty array [].
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

        // Snapshot previous affection BEFORE writing new value (used for trajectory).
        if (typeof parsed.affection === 'number' && Number.isFinite(parsed.affection)) {
            update.previousAffection = profile.affection;
            update.affection = Math.max(MIN_RELATIONSHIP_VALUE, Math.min(MAX_RELATIONSHIP_VALUE, Math.round(parsed.affection)));
        }

        // Four independent dimensions — each clipped to [-100, 100]. Negative
        // floor lets the model express active dislike/distrust/discomfort
        // when persistent negative behavior is observed, rather than just
        // clamping at 0 ("neutral stranger").
        for (const dim of ['trust', 'respect', 'comfort', 'chemistry'] as const) {
            const v = (parsed as any)[dim];
            if (typeof v === 'number' && Number.isFinite(v)) {
                update[dim] = Math.max(MIN_RELATIONSHIP_VALUE, Math.min(MAX_RELATIONSHIP_VALUE, Math.round(v)));
            }
        }

        // Append newly-noticed moments to the ring buffer; cap at MAX_MOMENTS,
        // oldest evicted. We use a single read-modify-write because Mongo's
        // $push + $slice combo would also work but keeping it explicit here
        // makes the validation/sanitization clearer.
        const newMomentsRaw = Array.isArray((parsed as any).newMoments) ? (parsed as any).newMoments : [];
        const cleanNewMoments: Moment[] = [];
        for (const m of newMomentsRaw) {
            const summary = typeof m?.summary === 'string' ? m.summary.trim() : '';
            if (!summary) continue;
            const toneRaw = typeof m?.tone === 'string' ? m.tone.toLowerCase() : 'fun';
            const tone = (VALID_MOMENT_TONES.has(toneRaw) ? toneRaw : 'fun') as MomentTone;
            cleanNewMoments.push({
                summary: truncate(summary, MOMENT_CHAR_BUDGET),
                tone,
                createdAt: new Date(),
            });
            if (cleanNewMoments.length >= 2) break;  // hard cap on per-distill additions
        }
        if (cleanNewMoments.length > 0) {
            const combined = [...(profile.moments || []), ...cleanNewMoments]
                .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
                .slice(-MAX_MOMENTS);
            update.moments = combined;
        }

        await UserProfileModel.updateOne({ userId: profile.userId }, { $set: update });
        const dimSummary = [
            update.trust != null ? `trust=${update.trust}` : null,
            update.respect != null ? `respect=${update.respect}` : null,
            update.comfort != null ? `comfort=${update.comfort}` : null,
            update.chemistry != null ? `chemistry=${update.chemistry}` : null,
        ].filter(Boolean).join(' ');
        const momentSummary = cleanNewMoments.length > 0
            ? ` +${cleanNewMoments.length} moment(s)`
            : '';
        console.log(
            `🧠 [Profile] distilled ${profile.username || profile.userId} ` +
            `(count=${profile.interactionCount}) — aff=${update.affection ?? profile.affection}` +
            (dimSummary ? ` ${dimSummary}` : '') + momentSummary,
        );
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
