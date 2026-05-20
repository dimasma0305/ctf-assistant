import mongoose from 'mongoose';
import { InferSchemaType } from 'mongoose';
const { Schema } = mongoose;

/**
 * Lorebook entries — keyword-triggered context injections, modeled after
 * SillyTavern's "World Info" system. When a user message (or recent channel
 * activity) contains any of an entry's `keys`, that entry's `content` gets
 * injected into the per-turn ctx block under `lorebook:`.
 *
 * Use cases:
 *   - Community-specific facts (TCP1P traditions, channel purposes, key members)
 *   - CTF terminology / event-specific shorthand
 *   - Inside jokes that aren't per-user
 *   - Recent notable events (last CTF result, upcoming competitions)
 *
 * Editing in V1 is via direct Mongo (db.lorebookentries.updateOne(...)).
 * V2 will ship slash commands for live admin CRUD.
 */
export const schema = {
    // Keywords/phrases that activate this entry. Matched case-insensitively
    // against user message + recent channel snippets. Word-boundary scan
    // (avoids "king" inside "liking") for short keys; substring for ≥4-char keys.
    keys: { type: [String], default: [], required: true },

    // The content injected when activated. Self-contained — don't reference
    // other entries by name (entries activate independently).
    content: { type: String, required: true },

    // Higher priority = injected first when budget is tight. Range 0-100.
    priority: { type: Number, default: 50, min: 0, max: 100 },

    // Scope: 'global' injects everywhere; a guildId scopes to one server.
    // Empty/undefined = global.
    scope: { type: String, default: 'global' },

    // Constant entries inject every turn regardless of keyword match. Use
    // sparingly — they always consume budget.
    constant: { type: Boolean, default: false },

    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
};

export const lorebookSchema = new Schema(schema);
lorebookSchema.index({ priority: -1, createdAt: -1 });
lorebookSchema.index({ keys: 1 });

export type LorebookSchemaType = InferSchemaType<typeof lorebookSchema>;
