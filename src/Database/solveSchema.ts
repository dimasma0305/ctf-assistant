import mongoose from 'mongoose';
const { Schema } = mongoose;

export const solveSchema = {
    ctf_id: {
        type: String,
    },
    users: {
        type: [String],
    },
    challenge: String,
    category: {
        type: String,
        default: "Unknown"
    },
    points: {
        type: Number,
        default: 100  // Default points for challenges without specified points
    },
    solved_at: {
        type: Date,
        default: Date.now
    }
}

export type SolveSchemaType = typeof solveSchema;
export default new Schema(solveSchema);
