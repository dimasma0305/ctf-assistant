import mongoose from 'mongoose';
import { InferSchemaType } from 'mongoose';
const { Schema } = mongoose;

// Singleton bot state — Hackerika's persistent "now" state. One document
// global to the process. Keyed by a fixed string for deterministic lookup.
export const SINGLETON_KEY = 'singleton';

export const schema = {
    key: {
        type: String,
        required: true,
        unique: true,
        default: SINGLETON_KEY,
    },
    // Free-form short description of current emotional state
    mood: { type: String, default: 'lagi santai aja, nimbrung di Discord' },
    // 0-100: tired → energetic
    energy: { type: Number, default: 70, min: 0, max: 100 },
    // What's she thinking about right now (1-2 phrases)
    focus: { type: String, default: '' },
    // What she's "doing" right now (embodiment cue, fake physical state)
    activity: { type: String, default: 'ngeliatin chat' },
    // Longer-running preoccupations / things she's been into lately
    preoccupations: { type: String, default: '' },
    // Latest diary entry summary (set by the daily consolidation job)
    latestDiarySummary: { type: String, default: '' },
    latestDiaryAt: { type: Date },
    lastUpdatedAt: { type: Date, default: Date.now },
};

export const botStateSchema = new Schema(schema);
export type BotStateSchemaType = InferSchemaType<typeof botStateSchema>;
