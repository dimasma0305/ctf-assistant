import mongoose from 'mongoose';
import { InferSchemaType } from 'mongoose';
const { Schema } = mongoose;

/**
 * Designates a channel as a "sharing channel" — meant to hold resources
 * (links, images, files, writeups) rather than chat. A cron job
 * (`src/Events/Client/sharingChannelCron.ts`) periodically prunes messages
 * that don't qualify as sharing, keeping the channel as a clean resource log.
 *
 * V1 management: insert/remove rows directly via Mongo:
 *   db.sharingchannelconfigs.insertOne({ guildId: "...", channelId: "..." })
 *   db.sharingchannelconfigs.deleteOne({ channelId: "..." })
 *
 * V2 will ship slash commands for admin CRUD.
 */
export const schema = {
    guildId: { type: String, required: true },
    channelId: { type: String, required: true, unique: true },

    // How long a freshly-posted message is exempt from pruning. Default 30 min
    // lets people post a discussion burst before realizing they should move it
    // to another channel.
    gracePeriodMin: { type: Number, default: 30 },

    // Optional: user IDs whose messages are ALWAYS kept regardless of content
    // (e.g. admins making announcements that happen to be plain text).
    exemptUserIds: { type: [String], default: [] },

    // Optional: role IDs whose messages are ALWAYS kept.
    exemptRoleIds: { type: [String], default: [] },

    // Bookkeeping.
    addedAt: { type: Date, default: Date.now },
    lastSweepAt: { type: Date },
    lastSweepDeleted: { type: Number, default: 0 },
};

export const sharingChannelSchema = new Schema(schema);
sharingChannelSchema.index({ guildId: 1, channelId: 1 }, { unique: true });

export type SharingChannelSchemaType = InferSchemaType<typeof sharingChannelSchema>;
