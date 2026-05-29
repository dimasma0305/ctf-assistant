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

    // 384-dim semantic embedding from BGE-small-en-v1.5 via Cloudflare Workers
    // AI. Populated async after insert (fire-and-forget); doc is still
    // keyword-searchable while embedding is pending. `null` = not yet
    // computed or compute failed.
    embedding: {
        type: [Number],
        default: undefined,    // sparse — only stored when populated
    },

    // Importance score 1-10, set async by deepseek-v4-flash after insert.
    // Used by retrieval to weight high-signal events over chit-chat.
    //   1-3  filler / acknowledgements / "lol"
    //   4-6  normal discussion / questions / casual help
    //   7-8  technical insights / decisions / vulnerabilities found
    //   9-10 critical announcements / lore-worthy moments
    importance: { type: Number, default: 5, min: 1, max: 10 },
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
// Bare recency index: the bot-state/diary distillers query the whole collection
// ordered by createdAt (no guild filter), which the guildId-prefixed compounds
// above cannot serve — without this it's a full collection scan + sort.
indexedMessageSchema.index({ createdAt: -1 });

// TTL — Mongo deletes docs RETENTION_SECONDS after indexedAt.
indexedMessageSchema.index({ indexedAt: 1 }, { expireAfterSeconds: RETENTION_SECONDS });

export type IndexedMessageSchemaType = InferSchemaType<typeof indexedMessageSchema>;
