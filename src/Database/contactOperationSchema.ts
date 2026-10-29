import { Schema } from 'mongoose';

export const contactOperationSchema = new Schema({
    operationId: { type: String, required: true, unique: true },
    ownerId: { type: String, required: true },
    guildId: { type: String, default: '' },
    channelId: { type: String, required: true },
    requestMessageId: { type: String, required: true },
    requestText: { type: String, required: true },
    mode: { type: String, enum: ['dm', 'channel'], required: true },
    sourceListMessageId: String,
    includeCreator: { type: Boolean, default: false },
    excludedUserIds: { type: [String], default: [] },
    recipients: { type: [{
        _id: false, userId: { type: String, required: true }, content: { type: String, required: true },
        state: { type: String, enum: ['pending', 'sending', 'sent', 'failed'], default: 'pending' },
        messageId: String, error: String, lastAttemptMessageId: String,
    }], required: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
});
contactOperationSchema.index({ ownerId: 1, guildId: 1, channelId: 1, createdAt: -1 });
contactOperationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
