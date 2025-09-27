import mongoose from 'mongoose';
import { InferSchemaType } from 'mongoose';
const { Schema } = mongoose;

export const schema = {
    ctfEventId: String,
    messageId: String,
    channelId: String,
    guildId: String,
    expireAt: {
        type: Date,
        index: { expires: '1s' }
    }
};

export const messageSchema = new Schema(schema);
export type MessageSchemaType = InferSchemaType<typeof messageSchema>;
