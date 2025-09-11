import mongoose from 'mongoose';
const { Schema } = mongoose;

export const challengeSchema = {
    // Challenge identification
    challenge_id: {
        type: String,
        required: true,
    },
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

export type ChallengeSchemaType = typeof challengeSchema;

const schema = new Schema(challengeSchema);

// Create compound indexes for efficient queries
schema.index({ ctf_id: 1, challenge_id: 1 }, { unique: true }); // Unique per CTF
schema.index({ ctf_id: 1, name: 1 }); // Query by name within CTF
schema.index({ ctf_id: 1, category: 1 }); // Query by category within CTF

export default schema;
