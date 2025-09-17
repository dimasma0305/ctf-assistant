import mongoose from 'mongoose';
const { Schema } = mongoose;

export const weightRetrySchema = {
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

export type WeightRetrySchemaType = typeof weightRetrySchema;
export default new Schema(weightRetrySchema);
