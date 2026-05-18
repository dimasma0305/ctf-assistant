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

    // Affection score 0-100. Hackerika's emotional closeness to this user,
    // updated incrementally by the distillation pass. Drives the Hackerika
    // Fan role gate — user must reach affection >= 60 to be eligible.
    //   0-20  stranger / netral
    //   20-40 acquaintance
    //   40-60 friend
    //   60-80 close / fan-worthy
    //   80-100 deep affection
    affection: { type: Number, default: 0, min: 0, max: 100 },

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
