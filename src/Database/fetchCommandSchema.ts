import mongoose from 'mongoose';
const { Schema } = mongoose;

export const fetchCommandSchema = {
    ctf: {
        type: Schema.Types.ObjectId,
        ref: 'CTFCache',
        required: true,
    },
    channel_id: {
        type: String,
        required: true,
    },
    url: {
        type: String,
        required: true,
    },
    method: {
        type: String,
        required: true,
        default: 'GET'
    },
    headers: {
        type: Schema.Types.Mixed,
        required: false,
    },
    body: {
        type: String,
        required: false,
    },
    is_active: {
        type: Boolean,
        default: true,
    },
    last_executed: {
        type: Date,
        default: null,
    },
    created_at: {
        type: Date,
        default: Date.now,
    },
}

export type FetchCommandSchemaType = typeof fetchCommandSchema;
export default new Schema(fetchCommandSchema);
