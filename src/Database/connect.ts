import mongoose from 'mongoose';
import eventSchema from './eventSchema';
import solveSchema from './solveSchema';
import messageSchema from './messageSchema';
import sessionStateSchema from './sessionStateSchema';
import fetchCommandSchema from './fetchCommandSchema';
import ctfCacheSchema from './ctfCacheSchema';

const MONGO_URI = process.env.MONGO_URI || ""

export async function connect() {
    return await mongoose.connect(MONGO_URI)
}

export const EventModel = mongoose.model("Event", eventSchema)
export const solveModel = mongoose.model("Solve", solveSchema)
export const MessageModel = mongoose.model("Message", messageSchema)
export const SessionStateModel = mongoose.model("SessionState", sessionStateSchema)
export const FetchCommandModel = mongoose.model("FetchCommand", fetchCommandSchema)
export const CTFCacheModel = mongoose.model("CTFCache", ctfCacheSchema)

export default { connect, EventModel, solveModel, MessageModel, SessionStateModel, FetchCommandModel, CTFCacheModel }
