import mongoose from 'mongoose';
const { Schema } = mongoose;

export const eventSchema = {
    organizer: String,
    description: String,
    title: String,
    url: String,
    restrictions: {
        type: [String],
        enum: ['SMA', 'SMK', 'Universitas', 'Politeknik', 'Umum']
    },
    format: {
        type: [String],
        enum: ['jeopardy', 'attack & defense', 'speed ctf']
    },
    logo: String,
    timelines: [{
        name: String,
        discordEventId: String,
        startTime: Date,
        endTime: Date,
        location: {
            type: String,
            default: "Online"
        },
        timezone: {
            type: String,
            enum: ['WIB', 'WITA', 'WIT']
        },
    }],
}

export type EventSchemaType = typeof eventSchema;
export default new Schema(eventSchema);
