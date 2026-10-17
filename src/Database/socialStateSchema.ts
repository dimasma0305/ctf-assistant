import { Schema } from 'mongoose';

// Separate from the periodically distilled profile: boundaries take effect now
// and must not be overwritten by a background personality update.
export const socialStateSchema = new Schema({
    userId: { type: String, required: true, unique: true },
    anger: { type: Number, default: 0, min: 0, max: 100 },
    hurt: { type: Number, default: 0, min: 0, max: 100 },
    warmth: { type: Number, default: 20, min: 0, max: 100 },
    reason: { type: String, default: '', maxlength: 240 },
    updatedAt: { type: Date, default: Date.now },
    ignoredUntil: { type: Date, default: null },
    // Empty means all channels, otherwise only this channel is muted.
    ignoreChannelId: { type: String, default: '' },
    ignoreReason: { type: String, default: '', maxlength: 240 },
    handoff: {
        type: new Schema({
            dmChannelId: String,
            guildId: String,
            guildName: String,
            channelName: String,
            sourceChannelId: String,
            sourceMessageId: String,
            reason: String,
            // Only this user's exchange, never the whole public transcript.
            lastUserMessage: String,
            openingMessage: String,
            startedAt: Date,
            expiresAt: Date,
        }, { _id: false }),
        default: null,
    },
}, { bufferCommands: false });
