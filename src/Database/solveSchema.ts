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
// Per-user metric queries — find({ users }) / find({ users, ctf_id }) in
// api/utils/statistics.ts + api/routes/profiles.ts — were full COLLSCANs.
// The compound also serves the bare {users} predicate via its index prefix.
solveSchema.index({ users: 1, ctf_id: 1 });
// Month/year leaderboard ranges — find({ solved_at: { $gte, $lte } }) in the
// scoreboard route + dataService, and the min/max solved_at time-range aggregate.
solveSchema.index({ solved_at: 1 });

export type SolveSchemaType = InferSchemaType<typeof solveSchema>;
