import { Schema } from 'mongoose';

// This release carries the user's explicit one-time reset request. Keep the
// identifier fixed: a routine restart must never reset a relationship again.
export const AFFECTION_RESET_VERSION = 'relationship-reset-2026-10-16';
export const affectionResetSchema = new Schema({
    key: { type: String, required: true, unique: true },
    requestedAt: { type: Date, required: true },
    appliedAt: { type: Date, default: null },
    affectedProfiles: { type: Number, default: 0 },
}, { bufferCommands: false });
