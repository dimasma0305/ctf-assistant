import mongoose from 'mongoose';
const { Schema } = mongoose;

export const messageSchema = {
    ctfEventId: String,
    messageId: String,
    channelId: String,
    guildId: String,
    expireAt: {
        type: Date,
        index: { expires: '1s' }
    }
};

export type MessageSchemaType = typeof messageSchema;
export default new Schema(messageSchema); 