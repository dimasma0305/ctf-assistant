import mongoose from 'mongoose';
import { InferSchemaType } from 'mongoose';
const { Schema } = mongoose;

export const schema = {
    channelId: {
        type: String,
        required: true,
        unique: true
    },
    messages: {
        type: Array,
        required: true,
    },
    createdAt: {
        type: Date,
        expires: '1h',
        default: Date.now
    }
}

export const messageCacheSchema = new Schema(schema);
export type MessageCacheSchemaType = InferSchemaType<typeof messageCacheSchema>;
