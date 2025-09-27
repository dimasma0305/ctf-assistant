import mongoose from 'mongoose';
import { InferSchemaType } from 'mongoose';
const { Schema } = mongoose;

export const schema = {
    ctf_id: {
        type: String,
        required: true,
    },
    users: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }],
    challenge_ref: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Challenge',
        required: true
    },
    solved_at: {
        type: Date,
        default: Date.now
    }
}

export const solveSchema = new Schema(schema);
export type SolveSchemaType = InferSchemaType<typeof solveSchema>;
