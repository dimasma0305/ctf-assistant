import mongoose from 'mongoose';
const { Schema } = mongoose;

export const userSchema = {
    // Discord user ID as the primary identifier
    discord_id: {
        type: String,
        required: true,
        unique: true
    },
    username: {
        type: String,
        required: true
    },
    display_name: {
        type: String,
        required: true
    },
    avatar: {
        type: String,
        required: false
    },
    created_at: {
        type: Date,
        default: Date.now
    },
    updated_at: {
        type: Date,
        default: Date.now
    }
}

export type UserSchemaType = typeof userSchema;
export default new Schema(userSchema);
