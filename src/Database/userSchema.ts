import mongoose from 'mongoose';
import { InferSchemaType } from 'mongoose';
const { Schema } = mongoose;

export const schema = {
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

export const userSchema = new Schema(schema);
export type UserSchemaType = InferSchemaType<typeof userSchema>;
