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
