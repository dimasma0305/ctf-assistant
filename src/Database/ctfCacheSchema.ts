import mongoose from 'mongoose';
const { Schema } = mongoose;

export const ctfCacheSchema = {
    ctf_id: {
        type: String,
        required: true,
        unique: true
    },
    title: {
        type: String,
        required: true
    },
    weight: {
        type: Number,
        required: true,
        default: 0
    },
    start: {
        type: Date,
        required: true
    },
    finish: {
        type: Date,
        required: true
    },
    participants: {
        type: Number,
        default: 0
    },
    organizers: [{
        id: Number,
        name: String
    }],
    description: String,
    url: String,
    logo: String,
    format: String,
    location: String,
    onsite: Boolean,
    restrictions: String,
    duration: {
        hours: Number,
        days: Number
    },
    // Cache metadata
    cached_at: {
        type: Date,
        default: Date.now
    },
    last_updated: {
        type: Date,
        default: Date.now
    }
}

export type CTFCacheSchemaType = typeof ctfCacheSchema;
export default new Schema(ctfCacheSchema);
