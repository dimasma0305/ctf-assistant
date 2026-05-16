import mongoose from 'mongoose';
import { InferSchemaType } from 'mongoose';
const { Schema } = mongoose;

// 90 days, in seconds — TTL for indexed messages. Older docs auto-deleted by Mongo.
const RETENTION_SECONDS = 90 * 24 * 60 * 60;

export const schema = {
    // Discord message id — primary identifier, unique per message.
    messageId: {
        type: String,
        required: true,
        unique: true,
    },
    guildId: {
        type: String,
        required: true,
    },
    channelId: {
        type: String,
        required: true,
    },
    authorId: {
        type: String,
        required: true,
    },
    authorUsername: String,
    authorDisplayName: String,
    isBot: { type: Boolean, default: false },
    content: {
        type: String,
        default: '',
    },
    // Whether the message had attachments / embeds — useful for filtering "image"
    // searches even though we don't store the binary content.
    hasAttachments: { type: Boolean, default: false },
    hasEmbeds: { type: Boolean, default: false },
    // When the message was originally sent (used for time-based ordering).
    createdAt: {
        type: Date,
        required: true,
    },
    // TTL anchor — index drops docs after RETENTION_SECONDS past this field.
    indexedAt: {
        type: Date,
        default: Date.now,
    },
};

export const indexedMessageSchema = new Schema(schema);

// Compound indexes for the common query shapes:
//   - search by guild + content text   (Mongo $text)
//   - filter by author + recency
//   - filter by channel + recency
indexedMessageSchema.index({ content: 'text' });
indexedMessageSchema.index({ guildId: 1, channelId: 1, createdAt: -1 });
indexedMessageSchema.index({ guildId: 1, authorId: 1, createdAt: -1 });
indexedMessageSchema.index({ guildId: 1, createdAt: -1 });

// TTL — Mongo deletes docs RETENTION_SECONDS after indexedAt.
indexedMessageSchema.index({ indexedAt: 1 }, { expireAfterSeconds: RETENTION_SECONDS });

export type IndexedMessageSchemaType = InferSchemaType<typeof indexedMessageSchema>;
