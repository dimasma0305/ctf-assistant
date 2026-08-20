import mongoose, { InferSchemaType } from "mongoose";

const { Schema } = mongoose;

export const memberWelcomeStateSchema = new Schema({
    guildId: { type: String, required: true, unique: true },
    lastCheckedAt: { type: Date, required: true, default: Date.now },
    welcomedMemberIds: { type: [String], default: [] },
    lastRunAt: { type: Date },
    lastError: { type: String },
    updatedAt: { type: Date, default: Date.now },
}, { versionKey: false });

export type MemberWelcomeStateSchemaType =
    InferSchemaType<typeof memberWelcomeStateSchema>;
