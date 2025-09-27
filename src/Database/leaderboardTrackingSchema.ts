import mongoose from 'mongoose';
import { InferSchemaType } from 'mongoose';
const { Schema } = mongoose;

export const schema = {
    messageId: { type: String, required: true, unique: true },
    channelId: { type: String, required: true },
    guildId: { type: String, required: true },
    isGlobal: { type: Boolean, required: true, default: true },
    limit: { type: Number, required: true, default: 10 },
    ctfId: { type: String, required: false }, // Only set if isGlobal is false
    lastUpdated: { type: Date, default: Date.now },
    lastHash: { type: String }, // Hash of last leaderboard data to detect changes
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
};

export const leaderboardTrackingSchema = new Schema(schema);
export type LeaderboardTrackingSchemaType = InferSchemaType<typeof leaderboardTrackingSchema>;
