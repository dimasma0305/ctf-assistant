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
    api_key: {
        type: String,
        required: true,
    },
    is_active: {
        type: Boolean,
        default: true,
    },
    last_checked: {
        type: Date,
        default: null,
    },
    created_at: {
        type: Date,
        default: Date.now,
    },
    updated_at: {
        type: Date,
        default: Date.now,
    },
}

export const trakteerSchema = new Schema(schema);
export type TrakteerSchemaType = InferSchemaType<typeof trakteerSchema>;

