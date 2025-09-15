import mongoose from 'mongoose';
const { Schema } = mongoose;

export const solveSchema = {
    ctf_id: {
        type: String,
        required: true,
    },
    users: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }],
    // Reference to Challenge model
    challenge_ref: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Challenge',
        required: true
    },
    // Keep challenge name for backward compatibility and quick access
    challenge: String,
    category: {
        type: String,
        default: "Unknown"
    },
    // Remove points from solve as it should come from challenge
    // points: {
    //     type: Number,
    //     default: 100
    // },
    solved_at: {
        type: Date,
        default: Date.now
    }
}

export type SolveSchemaType = typeof solveSchema;
export default new Schema(solveSchema);
