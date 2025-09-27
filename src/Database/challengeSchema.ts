import mongoose, { InferSchemaType } from 'mongoose';
const { Schema } = mongoose;

export const schema = {
    name: {
        type: String,
        required: true,
    },
    category: {
        type: String,
        required: true,
        default: "misc"
    },
    
    // Challenge details
    points: {
        type: Number,
        required: true,
        default: 100
    },
    description: {
        type: String,
        default: ""
    },
    solves: {
        type: Number,
        default: 0
    },
    tags: {
        type: [String],
        default: []
    },
    
    // CTF Event relation
    ctf_id: {
        type: String,
        required: true,
        ref: 'Event'  // Reference to Event model
    },
    
    // Status
    is_solved: {
        type: Boolean,
        default: false
    },
    
    // Platform specific data
    platform_data: {
        type: Schema.Types.Mixed,
        default: {}
    },
    
    // Timestamps
    created_at: {
        type: Date,
        default: Date.now
    },
    updated_at: {
        type: Date,
        default: Date.now
    }
}

export const challengeSchema = new Schema(schema);
export type ChallengeSchemaType = InferSchemaType<typeof challengeSchema>;
