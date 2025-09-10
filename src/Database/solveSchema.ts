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
    }
}

export type SolveSchemaType = typeof solveSchema;
export default new Schema(solveSchema);
