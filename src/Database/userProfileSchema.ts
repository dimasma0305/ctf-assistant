import mongoose from 'mongoose';
import { InferSchemaType } from 'mongoose';
const { Schema } = mongoose;

export const schema = {
    // Discord user ID — global across guilds. One profile per user.
    userId: {
        type: String,
        required: true,
        unique: true,
    },
    username: String,
    displayName: String,

    // Psychological/personality observations built up by Hackerika over time
    // via periodic distillation. Each field is free-form text, capped at ~300
    // chars in the distillation prompt to keep prompt costs predictable.
    personality: { type: String, default: '' },
    interests: { type: String, default: '' },
    communicationStyle: { type: String, default: '' },

    // Hackerika's *personal* feeling/opinion about this user. First person.
    // Allowed to be subjective (suka, respect, biasa-aja, gemas, capek-an).
    opinion: { type: String, default: '' },

    // Recent emotional state — "happy", "stressed", "frustrated", "tired"
    // — extracted from recent exchanges. Updated each distillation. Used by
    // Hackerika for proactive check-ins when distress signals persist.
    emotionalState: { type: String, default: '' },

    // User's IANA timezone (e.g. "Asia/Jakarta", "America/New_York"). Set
    // explicitly by Hackerika via the set_user_timezone tool when the user
    // reveals their location. Empty string = not set; downstream code defaults
    // to "Asia/Jakarta" (community default) until then.
    timezone: { type: String, default: '' },

    // Affection score 0-100. Hackerika's overall warmth toward this user.
    // Drives the Hackerika Fan role gate (user must reach >= 60).
    // Tiers also serve as vulnerability gates for self-disclosure:
    //   0-30  stranger/acquaintance — keep things polite, no personal mood
    //   30-60 friend                — small embodiment cues OK
    //   60-80 close / fan-worthy    — share preoccupations naturally
    //   80-100 inner circle         — full sharing, diary references OK
    affection: { type: Number, default: 0, min: 0, max: 100 },

    // Snapshot of `affection` at the previous distillation. Lets us compute
    // a trajectory delta ("affection 65/100 +4 since last") so the model has
    // a sense of whether the relationship is climbing or stalling.
    previousAffection: { type: Number, default: 0, min: 0, max: 100 },

    // Four independent relationship dimensions. They move separately:
    //   trust:     0-100 — do I believe they're genuine? (consistency, honesty)
    //   respect:   0-100 — do I value their input? (technical insight, helpfulness)
    //   comfort:   0-100 — do I feel relaxed around them? (low friction, predictability)
    //   chemistry: 0-100 — banter/humor fit (jokes land, tone syncs, playful rhythm)
    // Same +0..+8 / -3..-8 per-distillation drift as `affection`. Independent
    // axes let the model tell apart "intimidating expert" (high respect, low comfort)
    // from "fun banter buddy" (high chemistry, low respect).
    trust: { type: Number, default: 0, min: 0, max: 100 },
    respect: { type: Number, default: 0, min: 0, max: 100 },
    comfort: { type: Number, default: 0, min: 0, max: 100 },
    chemistry: { type: Number, default: 0, min: 0, max: 100 },

    // Specific memorable exchanges with this user — capped at 8 (oldest dropped).
    // Each is one short sentence + a tone tag. Hackerika MAY reference these in
    // future replies when contextually relevant (callback humor / shared history)
    // but must NEVER dump verbatim or quote creepily.
    //
    //   summary  : concrete description (e.g. "lo bilang 'durian skill issue' wkwk")
    //   tone     : one of `fun` | `helpful` | `touching` | `tense` | `impressive`
    //   createdAt: when the moment happened (UTC)
    moments: {
        type: [{
            summary: { type: String, required: true },
            tone: {
                type: String,
                enum: ['fun', 'helpful', 'touching', 'tense', 'impressive'],
                default: 'fun',
            },
            createdAt: { type: Date, default: Date.now },
        }],
        default: [],
    },

    // Bookkeeping for the distillation schedule.
    interactionCount: { type: Number, default: 0 },
    lastDistilledAtCount: { type: Number, default: 0 },
    lastInteractionAt: { type: Date, default: Date.now },
    lastDistilledAt: { type: Date },
    createdAt: { type: Date, default: Date.now },
};

export const userProfileSchema = new Schema(schema);
userProfileSchema.index({ lastInteractionAt: -1 });

export type UserProfileSchemaType = InferSchemaType<typeof userProfileSchema>;
