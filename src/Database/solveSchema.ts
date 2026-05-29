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

// Indexes for the recurring solve lookups (the collection grows unbounded across
// all historical CTFs and had NO indexes):
//   - find({ ctf_id }) — getSolvedChallenges (every 5 min per active CTF) + list + CTF-scoped leaderboard
//   - findOne({ challenge_ref, ctf_id }) — per-/solve dedupe (fires twice per solve)
solveSchema.index({ ctf_id: 1 });
solveSchema.index({ challenge_ref: 1, ctf_id: 1 });

export type SolveSchemaType = InferSchemaType<typeof solveSchema>;
