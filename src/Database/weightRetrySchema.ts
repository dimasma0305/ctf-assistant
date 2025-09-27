import mongoose from 'mongoose';
import { InferSchemaType } from 'mongoose';
const { Schema } = mongoose;

export const schema = {
    ctf_id: {
        type: String,
        required: true,
        unique: true
    },
    ctf_title: {
        type: String,
        required: true
    },
    ctf_end_time: {
        type: Date,
        required: true
    },
    retry_until: {
        type: Date,
        required: true
    },
    last_retry: {
        type: Date,
        default: Date.now
    },
    retry_count: {
        type: Number,
        default: 0
    },
    current_weight: {
        type: Number,
        default: 0
    },
    is_active: {
        type: Boolean,
        default: true
    },
    created_at: {
        type: Date,
        default: Date.now
    }
}

export const weightRetrySchema = new Schema(schema);
export type WeightRetrySchemaType = InferSchemaType<typeof weightRetrySchema>;
