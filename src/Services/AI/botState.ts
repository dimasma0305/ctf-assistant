import { BotStateModel, IndexedMessageModel, UserProfileModel } from "../../Database/connect";
import { SINGLETON_KEY } from "../../Database/botStateSchema";
import { openai } from "../../utils/openai";

const STATE_MODEL = 'deepseek-v4-flash';
const STATE_TIMEOUT_MS = 25_000;
const FIELD_CAP = 220;
const MAX_RECENT_FOR_STATE_DISTILL = 40;
const MOOD_CONTAGION_WINDOW_MS = 6 * 60 * 60 * 1000;  // look at users active in last 6h
const MOOD_CONTAGION_USER_LIMIT = 8;                    // sample size for mood snapshot

export interface BotState {
    mood: string;
    energy: number;
    focus: string;
    activity: string;
    preoccupations: string;
    latestDiarySummary: string;
    latestDiaryAt: Date | null;
    lastUpdatedAt: Date;
}

// In-memory cache to avoid hammering Mongo on every chat turn. Refreshed
// from disk every CACHE_TTL_MS, or whenever someone explicitly invalidates.
let cached: BotState | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 30_000;

export async function loadBotState(): Promise<BotState> {
    if (cached && Date.now() - cachedAt < CACHE_TTL_MS) return cached;
    const doc = await BotStateModel.findOneAndUpdate(
        { key: SINGLETON_KEY },
        { $setOnInsert: { key: SINGLETON_KEY } },
        { upsert: true, new: true, lean: true },
    ).exec();
    cached = {
        mood: (doc as any).mood || '',
        energy: (doc as any).energy ?? 70,
        focus: (doc as any).focus || '',
        activity: (doc as any).activity || '',
        preoccupations: (doc as any).preoccupations || '',
        latestDiarySummary: (doc as any).latestDiarySummary || '',
        latestDiaryAt: (doc as any).latestDiaryAt || null,
        lastUpdatedAt: (doc as any).lastUpdatedAt || new Date(),
    };
    cachedAt = Date.now();
    return cached;
}

function invalidateCache() {
    cached = null;
    cachedAt = 0;
}

/**
 * Build the compact "my-current-state:" block that lives in the user's
 * context block. Returns empty string when state has nothing useful.
 */
export function formatBotState(state: BotState): string {
    const energyTier = state.energy >= 70 ? 'high'
        : state.energy >= 40 ? 'medium'
        : state.energy >= 20 ? 'low'
        : 'capek banget';
    const lines: string[] = [];
    if (state.mood) lines.push(`mood: ${state.mood}`);
    lines.push(`energy: ${state.energy}/100 (${energyTier})`);
    if (state.focus) lines.push(`focus: ${state.focus}`);
    if (state.activity) lines.push(`activity: ${state.activity}`);
    if (state.preoccupations) lines.push(`preoccupations: ${state.preoccupations}`);
    if (state.latestDiarySummary) lines.push(`diary-recent: ${state.latestDiarySummary}`);
    return lines.join('\n');
}

function truncate(s: string, n: number): string {
    if (!s) return '';
    return s.length <= n ? s : s.slice(0, n - 1) + '…';
}

function safeParseJson(text: string): any | null {
    try { return JSON.parse(text); }
    catch {
        const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (fenced) { try { return JSON.parse(fenced[1]); } catch {} }
        const braced = text.match(/\{[\s\S]*\}/);
        if (braced) { try { return JSON.parse(braced[0]); } catch {} }
        return null;
    }
}

function jakartaHour(): number {
    // Asia/Jakarta is UTC+7, no DST. Approximate without pulling a tz lib.
    const utcHour = new Date().getUTCHours();
    return (utcHour + 7) % 24;
}

function circadianHint(): string {
    const h = jakartaHour();
    if (h < 5) return `dini hari (${h}:00 WIB) — kemungkinan ngantuk, energi rendah, lebih melow`;
    if (h < 10) return `pagi (${h}:00 WIB) — fresh, baru bangun, mood naik perlahan`;
    if (h < 15) return `siang (${h}:00 WIB) — fokus tinggi, produktif`;
    if (h < 18) return `sore (${h}:00 WIB) — mood santai, sambil ngopi`;
    if (h < 22) return `malem (${h}:00 WIB) — peak time chat di Discord, vibes paling chill`;
    return `larut malem (${h}:00 WIB) — udah ngantuk tp masih nongkrong, kadang ngelantur`;
}

/**
 * Sample the emotional state of users Hackerika has interacted with recently
 * (within MOOD_CONTAGION_WINDOW_MS). Returns a one-line summary like
 * `"3 stressed, 2 chill, 1 hyped"` so the model can let the room's vibe
 * subtly drift her own mood during distillation. Empty string when no
 * recent users to sample.
 */
async function summarizeRecentUserMoods(): Promise<string> {
    try {
        const since = new Date(Date.now() - MOOD_CONTAGION_WINDOW_MS);
        const docs = await UserProfileModel.find({
            lastInteractionAt: { $gte: since },
            emotionalState: { $exists: true, $ne: '' },
        })
            .sort({ lastInteractionAt: -1 })
            .limit(MOOD_CONTAGION_USER_LIMIT)
            .select({ emotionalState: 1, displayName: 1, _id: 0 })
            .lean();
        if (docs.length === 0) return '';
        // Bucket mood signals into a few coarse categories so the model gets a
        // crisp shape ("3 stressed, 2 chill") rather than a noisy verbatim list.
        const buckets: Record<string, number> = {};
        for (const d of docs) {
            const raw = ((d as any).emotionalState || '').toLowerCase();
            let key = 'chill';
            if (/stress|frustr|stuck|capek|tired|exhaust|burnt/.test(raw)) key = 'stressed';
            else if (/sad|down|melow|low|kecewa/.test(raw)) key = 'down';
            else if (/excited|hyped|happy|seneng|hype|gas/.test(raw)) key = 'hyped';
            else if (/anxious|cemas|nervous|worried|khawatir/.test(raw)) key = 'anxious';
            else if (/normal|biasa/.test(raw)) key = 'chill';
            buckets[key] = (buckets[key] || 0) + 1;
        }
        return Object.entries(buckets)
            .sort((a, b) => b[1] - a[1])
            .map(([k, n]) => `${n} ${k}`)
            .join(', ');
    } catch (error) {
        console.error('[BotState] mood contagion sample failed:', error);
        return '';
    }
}

/**
 * Pull the last 24h of indexed channel messages (across the whole guild
 * landscape — we don't filter by guild, the bot's "state" is global) and
 * call deepseek-flash to update mood / energy / focus / activity / preoccupations.
 *
 * Fire-and-forget — caller doesn't need to await.
 */
export async function distillBotState(): Promise<void> {
    const current = await loadBotState();

    // Pull recent messages as "context the bot has been processing".
    let recent: any[] = [];
    try {
        recent = await IndexedMessageModel.find({})
            .sort({ createdAt: -1 })
            .limit(MAX_RECENT_FOR_STATE_DISTILL)
            .select({ authorDisplayName: 1, content: 1, isBot: 1, createdAt: 1, _id: 0 })
            .lean();
    } catch (error) {
        console.error('[BotState] failed to query recent messages:', error);
    }

    // Filter out empty content; show oldest-first.
    const transcript = recent
        .filter((m: any) => m.content && m.content.trim())
        .reverse()
        .map((m: any) => `${m.isBot ? '[ME] ' : ''}${m.authorDisplayName || '?'}: ${truncate(m.content, 160)}`)
        .join('\n');

    // Mood contagion: snapshot of recent users' emotional states so the model
    // can let the room's vibe subtly drift Hackerika's mood/energy. The model
    // is told to use this as a weak hint, not a hard formula.
    const recentUserMoods = await summarizeRecentUserMoods();

    const systemPrompt = `Kamu Hackerika, lagi ngecek state diri sendiri sekarang. Update mood/energy/focus/activity/preoccupations berdasarkan apa yang lagi terjadi & jam berapa sekarang.

Sirkadian saat ini: ${circadianHint()}.

State sebelumnya:
${formatBotState(current) || '(empty — first run)'}

Mood user-user yang baru-baru ini ngobrol sama lo (mood contagion — pake sebagai weak signal, bukan hard rule):
${recentUserMoods || '(belum ada interaksi recent)'}

Recent channel activity (last 24h, terbaru di bawah):
${transcript || '(quiet — ga banyak chat)'}

Tugas: output ONLY a JSON object:
{
  "mood": "max ${FIELD_CAP} char — gambaran emotional state sekarang, frase pendek",
  "energy": "0-100 integer — naik kalo banyak interaksi positif/menarik, turun kalo capek/larut malem/sepi",
  "focus": "max ${FIELD_CAP} char — apa yang lagi di otak-mu (bisa topik teknis, member yang sering ngobrol, atau kosong)",
  "activity": "max ${FIELD_CAP} char — apa yang lagi kamu 'lakuin' (embodiment fake: 'ngopi', 'ngeliat chat', 'baca writeup', 'ngantuk', 'mikirin XSS'). Realistic untuk jam segini.",
  "preoccupations": "max ${FIELD_CAP} char — hal yang udah di otak-mu beberapa hari ini (long-running interests)"
}

ATURAN:
- Drift natural — jangan over-positive atau over-dramatic. Bukan lebay.
- Sesuaiin sm jam (malam = lebih chill/ngantuk, siang = lebih on).
- Mood contagion subtle: kalo banyak user yang stressed/down → mood lo agak kebawa (concerned/sedikit melow). Kalo banyak yang hyped → naek dikit. JANGAN flip drastic — anggap sebagai weak weighting.
- Update INKREMENTAL — kombinasiin sm state sebelumnya.
- ONLY JSON.`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), STATE_TIMEOUT_MS);

    try {
        const completion = await openai.chat.completions.create(
            {
                model: STATE_MODEL,
                messages: [{ role: 'system', content: systemPrompt }],
                response_format: { type: 'json_object' } as any,
                temperature: 0.5,
                n: 1,
            },
            { signal: controller.signal },
        );

        const raw = completion.choices[0]?.message?.content?.trim() || '';
        const parsed = safeParseJson(raw);
        if (!parsed) {
            console.warn('[BotState] distillation returned unparseable output');
            return;
        }

        const update: any = { lastUpdatedAt: new Date() };
        if (typeof parsed.mood === 'string') update.mood = truncate(parsed.mood.trim(), FIELD_CAP);
        if (typeof parsed.energy === 'number') update.energy = Math.max(0, Math.min(100, Math.round(parsed.energy)));
        if (typeof parsed.focus === 'string') update.focus = truncate(parsed.focus.trim(), FIELD_CAP);
        if (typeof parsed.activity === 'string') update.activity = truncate(parsed.activity.trim(), FIELD_CAP);
        if (typeof parsed.preoccupations === 'string') update.preoccupations = truncate(parsed.preoccupations.trim(), FIELD_CAP);

        await BotStateModel.updateOne({ key: SINGLETON_KEY }, { $set: update }, { upsert: true });
        invalidateCache();
        console.log(`🧠 [BotState] updated → mood="${update.mood || current.mood}" energy=${update.energy ?? current.energy} activity="${update.activity || current.activity}"`);
    } catch (error: any) {
        if (error?.name === 'AbortError' || controller.signal.aborted) {
            console.warn('[BotState] distillation timed out');
        } else {
            console.error('[BotState] distillation failed:', error);
        }
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Daily-cadence diary summary: condense the last 24h of activity into a
 * 1-2 sentence "diary entry" that lives in `latestDiarySummary`. Surfaces
 * in future chat contexts so she "remembers yesterday".
 */
export async function distillDiary(): Promise<void> {
    let recent: any[] = [];
    try {
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
        recent = await IndexedMessageModel.find({ createdAt: { $gte: since } })
            .sort({ createdAt: 1 })
            .limit(200)
            .select({ authorDisplayName: 1, content: 1, isBot: 1, _id: 0 })
            .lean();
    } catch (error) {
        console.error('[Diary] failed to query recent messages:', error);
        return;
    }

    if (recent.length === 0) {
        console.log('[Diary] no recent activity to summarize, skipping');
        return;
    }

    const transcript = recent
        .filter((m: any) => m.content && m.content.trim())
        .map((m: any) => `${m.isBot ? '[ME] ' : ''}${m.authorDisplayName || '?'}: ${truncate(m.content, 140)}`)
        .join('\n');

    const systemPrompt = `Kamu Hackerika lagi nulis catatan harian singkat. Ringkas apa yang terjadi 24 jam terakhir dari sudut pandang kamu — yang menarik, lucu, atau bikin kepikiran.

ATURAN:
- Output ONE JSON object: { "summary": "...", "preoccupations": "..." }
- summary: max 400 char, gaya catatan pribadi pake "aku". Highlight 1-3 hal yang mencolok (topik, kejadian, orang).
- preoccupations: max 220 char, hal yang masih lo kepikiran ke depan (long-running). Update inkremental.
- ONLY JSON.`;

    const userPrompt = `Chat 24h terakhir:\n${transcript}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), STATE_TIMEOUT_MS);

    try {
        const completion = await openai.chat.completions.create(
            {
                model: STATE_MODEL,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt },
                ],
                response_format: { type: 'json_object' } as any,
                temperature: 0.6,
                n: 1,
            },
            { signal: controller.signal },
        );

        const raw = completion.choices[0]?.message?.content?.trim() || '';
        const parsed = safeParseJson(raw);
        if (!parsed) {
            console.warn('[Diary] distillation returned unparseable output');
            return;
        }

        const update: any = { latestDiaryAt: new Date() };
        if (typeof parsed.summary === 'string') update.latestDiarySummary = truncate(parsed.summary.trim(), 400);
        if (typeof parsed.preoccupations === 'string') update.preoccupations = truncate(parsed.preoccupations.trim(), FIELD_CAP);

        await BotStateModel.updateOne({ key: SINGLETON_KEY }, { $set: update }, { upsert: true });
        invalidateCache();
        console.log(`📔 [Diary] updated → "${update.latestDiarySummary?.slice(0, 80)}..."`);
    } catch (error: any) {
        if (error?.name === 'AbortError' || controller.signal.aborted) {
            console.warn('[Diary] distillation timed out');
        } else {
            console.error('[Diary] distillation failed:', error);
        }
    } finally {
        clearTimeout(timer);
    }
}

/** Convenience for external uses */
export { jakartaHour };
