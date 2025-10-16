import mongoose from 'mongoose';
import { InferSchemaType } from 'mongoose';
const { Schema } = mongoose;

export const schema = {
    // Discord guild (server) ID
    guild_id: {
        type: String,
        required: true,
    },
    // Discord channel ID where notifications will be sent
    channel_id: {
        type: String,
        required: true,
    },
    // Guild name for reference
    guild_name: {
        type: String,
        required: true,
    },
    // Channel name for reference
    channel_name: {
        type: String,
        required: true,
    },
    // Whether this channel should receive notifications
    is_active: {
        type: Boolean,
        default: true
    },
    // Event types this channel is subscribed to
    event_types: {
        type: [String],
        enum: ['weekly_reminder'],
        default: ['weekly_reminder']
    },
    // Who registered this channel
    registered_by: {
        type: String,
        required: true,
    },
    // Metadata for event tracking
    last_notification_sent: {
        type: Date,
        required: false
    },
    last_event_type_triggered: {
        type: String,
        required: false
    },
    notification_count: {
        type: Number,
        default: 0
    },
    // Timestamps
    created_at: {
        type: Date,
        default: Date.now
    },
    updated_at: {
        type: Date,
        default: Date.now
    }
}

// Create compound unique index to prevent duplicate guild-channel pairs
export const guildChannelSchema = new Schema(schema);
guildChannelSchema.index({ guild_id: 1, channel_id: 1 }, { unique: true });

export type GuildChannelSchemaType = InferSchemaType<typeof guildChannelSchema>;

