import mongoose from 'mongoose';
import { InferSchemaType } from 'mongoose';
const { Schema } = mongoose;

export const schema = {
    guild_id: {
        type: String,
        required: true,
    },
    channel_id: {
        type: String,
        required: true,
    },
    profile_url: {
        type: String,
        required: true,
    },
    username: {
        type: String,
        required: true,
        index: true,
    },
    account_id: {
        type: String,
        required: true,
    },
    source_account_id: {
        type: String,
        required: true,
    },
    is_active: {
        type: Boolean,
        default: true,
    },
    last_post_id: {
        type: String,
        default: null,
    },
    last_checked_at: {
        type: Date,
        default: null,
    },
    configured_by: {
        type: String,
        required: false,
        default: "",
    },
    created_at: {
        type: Date,
        default: Date.now,
    },
    updated_at: {
        type: Date,
        default: Date.now,
    },
};

export const instagramWatchStateSchema = new Schema(schema);
instagramWatchStateSchema.index({ guild_id: 1, channel_id: 1 }, { unique: true });
export type InstagramWatchStateSchemaType = InferSchemaType<typeof instagramWatchStateSchema>;
