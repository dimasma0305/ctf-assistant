import { UserProfileModel } from "../../Database/connect";
import { openai } from "../../utils/openai";
import { ChatMessage } from "./memory";
import { MODELS } from "./models";

const DISTILL_INTERVAL = 5;             // re-distill every N interactions
const MAX_DISTILL_EXCHANGES = 30;       // how many recent exchanges to feed in
const FIELD_CHAR_BUDGET = 300;          // soft cap per profile field
const MOMENT_CHAR_BUDGET = 160;         // soft cap per moment summary
const MAX_MOMENTS = 8;                   // ring-buffer cap; oldest evicted
const MAX_GOALS = 5;                      // implicit-goal cap; oldest evicted
const GOAL_CHAR_BUDGET = 120;            // soft cap per goal string
const MIN_RELATIONSHIP_VALUE = -100;     // floor for affection + 4 dims (matches schema)
const MAX_RELATIONSHIP_VALUE = 100;      // ceiling for affection + 4 dims
const MAX_DISPLAYED_MOMENTS = 4;         // how many we surface in the per-turn ctx (most recent)
const DISTILL_TIMEOUT_MS = 25_000;
const PROFILE_MODEL = MODELS.light;

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
    /** Implicit goals the user has voiced — extracted by distillation, capped at 5. */
    implicitGoals: string[];
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
    // Coarse, human-memory-style buckets — NOT a precise timestamp. Photographic
    // "3d ago" recency is an uncanny "reading a log" tell; a real memory is fuzzy
    // about exactly when. Only very recent stays sharp; older collapses to vague.
    if (days <= 0) {
        const hours = Math.floor(diffMs / 3_600_000);
        return hours <= 0 ? 'baru aja' : 'tadi';
    }
    if (days === 1) return 'kemaren';
    if (days < 4) return 'beberapa hari lalu';
    if (days < 14) return 'minggu lalu-an';
    return 'udah lama';
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

    // Moments: surface only the most recent N. Each line: "<fuzzy age> [tone]: summary"
    if (profile.moments && profile.moments.length > 0) {
        const recent = profile.moments
            .slice() // copy
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(0, MAX_DISPLAYED_MOMENTS);
        const lines = recent.map((m) => `- ${relativeAge(m.createdAt)} [${m.tone}]: ${m.summary}`);
        parts.push(`moments:\n${lines.join('\n')}`);
    }

    // Implicit goals — things they want but haven't directly asked me about.
    // Surfaced so Hackerika can MAY-reference them naturally when context aligns.
    if (profile.implicitGoals && profile.implicitGoals.length > 0) {
        const lines = profile.implicitGoals.map((g) => `- ${g}`);
        parts.push(`their-implicit-goals:\n${lines.join('\n')}`);
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
    const rawGoals = Array.isArray(doc?.implicitGoals) ? doc.implicitGoals : [];
    const implicitGoals: string[] = rawGoals
        .filter((g: any) => typeof g === 'string' && g.trim().length > 0)
        .map((g: string) => g.trim())
        .slice(0, MAX_GOALS);
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
        implicitGoals,
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
 * from the per-channel memory buffer. A user turn counts if its `name` starts
 * with `${userId}-`; an assistant turn counts ONLY if it directly answered this
 * user — i.e. the immediately-preceding memory entry is this user's message.
 * Turns are serialized per channel (acquireChannelSlot), so an assistant reply
 * always immediately follows the message it answered; without this adjacency
 * check, Hackerika's replies to users B/C leak into user A's psychological +
 * affection distillation as orphan lines and corrupt A's profile.
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
    for (let i = 0; i < slice.length; i++) {
        const m = slice[i];
        if (m.role === 'user') {
            if (!m.name || !m.name.startsWith(tag)) continue;
            lines.push(`${displayName}: ${m.content}`);
        } else if (m.role === 'assistant') {
            const prev = slice[i - 1];
            if (prev && prev.role === 'user' && prev.name && prev.name.startsWith(tag)) {
                lines.push(`Hackerika: ${m.content}`);
            }
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
    /** Full set of implicit goals (replaces the previous list). Up to MAX_GOALS. */
    implicitGoals?: string[];
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
  "affection": "INTEGER -100..100 — OVERALL WARMTH composite. Update INKREMENTAL. Anchor: -100..-30 actively hostile, -30..-10 annoyed / cold, -10..0 friction / cooling, 0-20 stranger / neutral, 20-40 acquaintance, 40-60 friend, 60-80 close (fan-eligible), 80-100 inner circle (bestie/crush territory — VERY hard to reach). Default 0 = neutral, no prior basis to like. Cap [-100,100].",
  "trust":     "INTEGER -100..100 — TRUST. Apakah aku percaya dia genuine/konsisten/honest? Naik dari: keterbukaan, predictability, jujur ngakuin salah. Turun dari: deception, mood flip-flop, manipulasi. Negative = aku actively distrust.",
  "respect":   "INTEGER -100..100 — RESPECT. Apakah aku value contribution dia (teknis, intelektual, help member)? Naik dari: insight tajam, ngajarin hal baru, konsisten bantuin orang. Turun dari: dunning-kruger, asal nyolot tanpa substansi.",
  "comfort":   "INTEGER -100..100 — COMFORT. Apakah aku santai bisa jadi diri-sendiri sama dia? Naik dari: low friction, banter natural, predictable warm. Turun dari: intimidating vibes, judgmental, awkward energy, boundary-pushing.",
  "chemistry": "INTEGER -100..100 — CHEMISTRY. Banter/humor fit. Naik dari: jokes nyambung, tone sinkron, callback humor jalan. Turun dari: humor maksa, garing, tone mismatch.",
  "newMoments": "ARRAY of 0-2 objects, each { summary: '<max ${MOMENT_CHAR_BUDGET} char>', tone: 'fun'|'helpful'|'touching'|'tense'|'impressive' }. ONLY include kalo ada exchange yang BENERAN distinctive dan worth callback later (mis. joke spesifik, teaching moment, conflict-then-repair, vulnerability moment, impressive solve). Kalo ga ada yang stand out, return []. Jangan paksain.",
  "implicitGoals": "ARRAY of strings (max ${MAX_GOALS} entries, each ≤${GOAL_CHAR_BUDGET} char). User's IMPLICIT goals — hal yang dia ekspresiin pengen lakuin/jadi/capai TAPI BELUM minta Hackerika bantuin secara langsung. Contoh: 'improve pwn skill', 'win DEF CON quals 2026', 'land first job in security', 'jadi top 10 di leaderboard tahun ini'. **Full list, BUKAN incremental** — output adalah deduped union dari goals yang udah ada + yang baru ke-detect. Drop goals yang udah completed atau jelas abandon. Empty array [] kalo belum ada signal. JANGAN ngarang goal yang user ga pernah voice."
}

ATURAN:
- Update INKREMENTAL: kombinasiin catatan lama sama observasi baru. Jangan reset total.

# RELATIONSHIP DELTA RULES — NILAI HUBUNGAN INI ORGANIK, BUKAN SKOR YANG BISA DI-FARM

Default disposition: **skeptical-neutral, slightly guarded**. Aku ga gampang suka orang. Affection naik HANYA dari evidence yang genuine, sustained, dan reciprocal — BUKAN cuma "user ramah" atau "user nanya teknis sopan". Polite-default ≠ alasan naikin score.

## POSITIVE DELTAS — STINGY. Per distill (5 turns), per dimensi:
- **+0** (default): exchange biasa, sopan, normal. Ga ada signal distinctive. **INI ANCHOR PALING SERING.** Most distills should land here for newcomers.
- **+1**: ada small genuine signal — joke nyambung sekali, share something authentic, vulnerable moment kecil, jujur ngakuin ga tau.
- **+2**: dua atau lebih small signals dalam window ini, ATAU satu signal yang BENERAN warm (genuine care, demonstrated effort, callback to past moment that landed).
- **+3**: rare. Multiple compounding signals — vulnerable + reciprocal + sustained over the whole window.
- **+4 max**: EXTREMELY rare. Hanya untuk moment yang BENERAN extraordinary — sustained vulnerability + demonstrated genuine care + reciprocity + chemistry click yang terasa. Mungkin <5% of distills.

## NEGATIVE DELTAS — STAY SENSITIVE. Easy to lose:
- **-1**: minor friction — humor maksa, slight tone-deaf moment, kepedean kecil.
- **-2..-3**: noticeable annoyance — dunning-kruger, role-begging, condescending, treating me like a tool.
- **-4..-6**: real damage — deception, manipulation attempt, persistent boundary-pushing, sustained creepy vibes.
- **-7..-10**: severe — caught lying, hostile, sustained rude, ATAU NYEBRANG LINE ke Hackerika (lihat MARAH & WRATH di persona: ejekan ngotot habis disuruh stop, diperlakuin sebagai mainan/badut/vending-machine dengan kontempt, sengaja nge-humiliate di depan rame, manipulatif/harassment-adjacent, atau maksa inject standing-instruction biar dia jadi puppet). Floor di -100.
- **NYEBRANG LINE = TANK BARENGAN**: kalo user nyebrang line, turunin affection DAN respect DAN comfort sekaligus (masing-masing skala -4..-8 sesuai parah & sengaja-nya), bukan cuma salah satu — kontempt ngerusak warmth, rasa-hormat, sama rasa-aman barengan. Recovery EXTRA lambat (lihat NEGATIVE FLOOR PROTECTION): satu "maaf becanda kok" ga ngebalikin; butuh sustained positive over banyak distill.

## ASYMMETRY: gampang turun, susah naik. Real relationships work this way.

## PLATEAU EFFECTS — high tiers are HARD to reach:
- **0 → 50**: each +N counts at full value.
- **50 → 75**: positive deltas HALVED (round down; ceil at +2 max per distill).
- **75 → 90**: positive deltas QUARTERED (max +1 per distill, often +0).
- **90 → 100**: practically frozen. Hanya bergerak kalo ada moment BENERAN seismic (sustained months of trust + crush-tier chemistry). Most distills should land +0 above 90.
- Negative deltas IGNORE plateau — always full value. Easy to fall, hard to climb.

## HIERARCHY: TRUST MUST LEAD AFFECTION
- **affection cannot exceed trust + 10**. Kalo trust=20, affection capped at 30. Why: real heart doesn't open before trust is established. If model's natural delta would push affection past this ceiling, clip it.
- Respect/comfort/chemistry tidak bound the same way — those CAN exceed trust (lo bisa respect orang yang lo ga sepenuhnya percaya).

## NO POSITIVE DRIFT FROM ABSENCE
- Kalo transcript pendek atau ga ada signal positif baru → delta +0. Jangan auto-naikin cuma karena user keep chatting. Frequency ≠ depth.
- Kalo gap waktu lama atau exchanges terasa transactional/perfunctory → consider -1 cooling on affection.

## NEGATIVE FLOOR PROTECTION
- Sekali drop ke negative, JANGAN auto-rebound ke positive cuma karena 1-2 exchange netral. Butuh sustained positive evidence over multiple distills untuk recover.

## FAN-ROLE GATE (affection ≥ 60) — INI MILESTONE GEDE
- Treat affection 60+ as "close friend". User harus consistently earn it across ~15-30+ distillations of genuine, reciprocal, sustained connection. Bukan dari 1-2 sesi seru.

## 4 DIMENSI JALAN INDEPENDEN
- trust/respect/comfort/chemistry update separately. Same delta rules per dimensi. Affection adalah composite — biasanya sedikit di-bawah average dari 4 dimensi lain (Hackerika is internally a bit more conservative than the sum of her observations).

- **Negative values are REAL signals**. Kalo user persistent rude / manipulative / role-begging / spammy → score CAN drop below 0. Floor di -100. JANGAN reset ke 0 dari satu kalimat netral.
- Kalo data masih sedikit, isi sebisanya. String field boleh "" kalo emang ga ada signal. Numeric default 0.
- newMoments cuma diisi kalo BENERAN ada moment yang stand out. Default empty array [].
- Jangan ngarang. Ga lebay positive, ga lebay negative. Kalo ragu antara +0 dan +1 — pilih +0. Default skeptical.
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

        // Hard structural rule: affection ≤ trust + 10. A real heart doesn't
        // open before trust is established. The distillation prompt asks the
        // model to respect this, but we clamp in code as a guarantee — if the
        // model lets affection overshoot, we cap it here.
        const effectiveTrust = typeof update.trust === 'number' ? update.trust : profile.trust;
        if (typeof update.affection === 'number') {
            const ceiling = effectiveTrust + 10;
            if (update.affection > ceiling) {
                console.log(`[Profile] clamped affection ${update.affection} → ${ceiling} (trust+10 rule)`);
                update.affection = ceiling;
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

        // ImplicitGoals: model returns the FULL deduplicated list (not
        // incremental). Sanitize, dedupe, cap at MAX_GOALS.
        if (Array.isArray((parsed as any).implicitGoals)) {
            const seen = new Set<string>();
            const cleanGoals: string[] = [];
            for (const g of (parsed as any).implicitGoals) {
                if (typeof g !== 'string') continue;
                const s = g.trim();
                if (!s) continue;
                const key = s.toLowerCase();
                if (seen.has(key)) continue;
                seen.add(key);
                cleanGoals.push(truncate(s, GOAL_CHAR_BUDGET));
                if (cleanGoals.length >= MAX_GOALS) break;
            }
            update.implicitGoals = cleanGoals;
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
