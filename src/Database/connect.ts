import mongoose from 'mongoose';
import eventSchema from './eventSchema';
import challengeSchema from './challengeSchema';
import solveSchema from './solveSchema';
import messageSchema from './messageSchema';
import sessionStateSchema from './sessionStateSchema';
import fetchCommandSchema from './fetchCommandSchema';
import ctfCacheSchema from './ctfCacheSchema';
import weightRetrySchema from './weightRetrySchema';
import leaderboardTrackingSchema from './leaderboardTrackingSchema';
import userSchema from './userSchema';

const MONGO_URI = process.env.MONGO_URI || ""

export async function connect() {
    return await mongoose.connect(MONGO_URI)
}

export const EventModel = mongoose.model("Event", eventSchema)
export const ChallengeModel = mongoose.model("Challenge", challengeSchema)
export const solveModel = mongoose.model("Solve", solveSchema)
export const MessageModel = mongoose.model("Message", messageSchema)
export const SessionStateModel = mongoose.model("SessionState", sessionStateSchema)
export const FetchCommandModel = mongoose.model("FetchCommand", fetchCommandSchema)
export const CTFCacheModel = mongoose.model("CTFCache", ctfCacheSchema)
export const WeightRetryModel = mongoose.model("WeightRetry", weightRetrySchema)
export const LeaderboardTrackingModel = mongoose.model("LeaderboardTracking", leaderboardTrackingSchema)
export const UserModel = mongoose.model("User", userSchema)

export default { connect, EventModel, ChallengeModel, solveModel, MessageModel, SessionStateModel, FetchCommandModel, CTFCacheModel, WeightRetryModel, LeaderboardTrackingModel, UserModel }
