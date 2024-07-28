import mongoose from 'mongoose';
import eventSchema from './eventSchema';

const MONGO_URI = process.env.MONGO_URI || ""

export async function connect() {
    await mongoose.connect(MONGO_URI);
}

export const EventModel = mongoose.model("Event", eventSchema)

export default { connect, EventModel }
