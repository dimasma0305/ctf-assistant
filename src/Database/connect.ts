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
import {trakteerSchema, type TrakteerSchemaType} from './trakteerSchema';
import { getMongoUri } from '../utils/env';

const DEFAULT_RETRY_DELAY_MS = Number(process.env.MONGO_CONNECT_RETRY_DELAY_MS || 2000);
const DEFAULT_MAX_RETRIES = Number(process.env.MONGO_CONNECT_RETRIES || 30);
const DEFAULT_SERVER_SELECTION_TIMEOUT_MS = Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS || 5000);

let connectionPromise: Promise<typeof mongoose> | null = null;

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function getConnectionErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }

    return String(error);
}

export async function connect() {
    if (mongoose.connection.readyState === 1) {
        return mongoose;
    }

    if (connectionPromise) {
        return connectionPromise;
    }

    const mongoUri = getMongoUri();
    if (!mongoUri) {
        throw new Error("No MongoDB connection string configured. Set MONGO_URI, MONGODB_URI, or DATABASE_URL.");
    }

    connectionPromise = (async () => {
        let lastError: unknown;

        for (let attempt = 1; attempt <= DEFAULT_MAX_RETRIES; attempt++) {
            try {
                console.log(`🗄️  Connecting to MongoDB (attempt ${attempt}/${DEFAULT_MAX_RETRIES})...`);

                const connection = await mongoose.connect(mongoUri, {
                    serverSelectionTimeoutMS: DEFAULT_SERVER_SELECTION_TIMEOUT_MS,
                });

                console.log('✅ Connected to MongoDB');
                return connection;
            } catch (error) {
                lastError = error;
                console.error(
                    `❌ MongoDB connection attempt ${attempt}/${DEFAULT_MAX_RETRIES} failed: ${getConnectionErrorMessage(error)}`
                );

                if (attempt < DEFAULT_MAX_RETRIES) {
                    await sleep(DEFAULT_RETRY_DELAY_MS);
                }
            }
        }

        throw new Error(
            `Unable to connect to MongoDB after ${DEFAULT_MAX_RETRIES} attempts: ${getConnectionErrorMessage(lastError)}`
        );
    })();

    try {
        return await connectionPromise;
    } catch (error) {
        connectionPromise = null;
        throw error;
    }
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
export const TrakteerModel = mongoose.model("Trakteer", trakteerSchema)

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
    TrakteerSchemaType,
}

export default {connect};
