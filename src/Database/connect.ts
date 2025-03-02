import mongoose from 'mongoose';
import eventSchema from './eventSchema';
import solveSchema from './solveSchema';

const MONGO_URI = process.env.MONGO_URI || ""

export async function connect() {
    return await mongoose.connect(MONGO_URI)
}

export const EventModel = mongoose.model("Event", eventSchema)
export const solveModel = mongoose.model("Solve", solveSchema)

export default { connect, EventModel, solveModel }
