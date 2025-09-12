import mongoose from 'mongoose';
const { Schema } = mongoose;

export const messageCacheSchema = new Schema({
    channelId: {
        type: String,
        required: true,
        unique: true
    },
    messages: {
        type: Array,
        required: true,
    },
    createdAt: {
        type: Date,
        expires: '1h',
        default: Date.now
    }
});

export default mongoose.model('MessageCache', messageCacheSchema);
