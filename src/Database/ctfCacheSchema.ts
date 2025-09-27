import mongoose from 'mongoose';
import { InferSchemaType } from 'mongoose';
const { Schema } = mongoose;

export const schema = {
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

export const ctfCacheSchema = new Schema(schema);
export type CTFCacheSchemaType = InferSchemaType<typeof ctfCacheSchema>;
