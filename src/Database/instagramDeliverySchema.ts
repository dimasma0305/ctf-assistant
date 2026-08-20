import mongoose, { InferSchemaType } from "mongoose";

const { Schema } = mongoose;

export const instagramBatchStateSchema = new Schema({
    key: { type: String, required: true, unique: true },
    lockUntil: { type: Date },
    updatedAt: { type: Date, default: Date.now },
}, { versionKey: false });

export const instagramProfileSyncSchema = new Schema({
    username: { type: String, required: true, unique: true },
    lastSuccessfulAt: { type: Date },
    nextAttemptAt: { type: Date },
    failureCount: { type: Number, default: 0 },
    lastError: { type: String },
    updatedAt: { type: Date, default: Date.now },
}, { versionKey: false });

export const instagramWatchCursorSchema = new Schema({
    watchId: { type: String, required: true, unique: true },
    username: { type: String, required: true },
    lastPostId: { type: String },
    initializedAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
}, { versionKey: false });

export const instagramDeliverySchema = new Schema({
    watchId: { type: String, required: true },
    guildId: { type: String },
    channelId: { type: String, required: true },
    username: { type: String, required: true },
    postId: { type: String, required: true },
    postUrl: { type: String, required: true },
    caption: { type: String, default: "" },
    mediaType: { type: String, default: "Post" },
    imageUrl: { type: String },
    profileImageUrl: { type: String },
    publishedAt: { type: Date },
    status: {
        type: String,
        enum: ["pending", "sending", "failed", "sent", "dead"],
        default: "pending",
    },
    attempts: { type: Number, default: 0 },
    lockedUntil: { type: Date },
    lastError: { type: String },
    discoveredAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    sentAt: { type: Date },
}, { versionKey: false });

instagramDeliverySchema.index(
    { watchId: 1, postId: 1 },
    { unique: true }
);
instagramDeliverySchema.index(
    { sentAt: 1 },
    {
        expireAfterSeconds: 90 * 24 * 60 * 60,
        partialFilterExpression: { status: "sent" },
    }
);

export type InstagramBatchStateSchemaType =
    InferSchemaType<typeof instagramBatchStateSchema>;
export type InstagramProfileSyncSchemaType =
    InferSchemaType<typeof instagramProfileSyncSchema>;
export type InstagramWatchCursorSchemaType =
    InferSchemaType<typeof instagramWatchCursorSchema>;
export type InstagramDeliverySchemaType =
    InferSchemaType<typeof instagramDeliverySchema>;
