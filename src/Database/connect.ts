import mongoose from 'mongoose';
import {challengeSchema, type ChallengeSchemaType} from './challengeSchema';
import {eventSchema, type EventSchemaType} from './eventSchema';
import {solveSchema, type SolveSchemaType} from './solveSchema';
import {messageSchema, type MessageSchemaType} from './messageSchema';
import {sessionStateSchema, type SessionStateSchemaType} from './sessionStateSchema';
import {fetchCommandSchema, type FetchCommandSchemaType} from './fetchCommandSchema';
import {ctfCacheSchema, type CTFCacheSchemaType} from './ctfCacheSchema';
import {weightRetrySchema, type WeightRetrySchemaType} from './weightRetrySchema';
import {leaderboardTrackingSchema, type LeaderboardTrackingSchemaType} from './leaderboardTrackingSchema';
import {userSchema, type UserSchemaType} from './userSchema';
import {messageCacheSchema, type MessageCacheSchemaType} from './messageCacheSchema';
import {guildChannelSchema, type GuildChannelSchemaType} from './guildChannelSchema';

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
export const MessageCacheModel = mongoose.model("MessageCache", messageCacheSchema)
export const GuildChannelModel = mongoose.model("GuildChannel", guildChannelSchema)

export {
    EventSchemaType,
    ChallengeSchemaType,
    SolveSchemaType,
    MessageSchemaType,
    SessionStateSchemaType,
    FetchCommandSchemaType,
    CTFCacheSchemaType,
    WeightRetrySchemaType,
    LeaderboardTrackingSchemaType,
    UserSchemaType,
    MessageCacheSchemaType,
    GuildChannelSchemaType,
}

export default {connect};