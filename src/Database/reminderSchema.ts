import mongoose from 'mongoose';
import { InferSchemaType } from 'mongoose';
const { Schema } = mongoose;

/**
 * Persistent reminders. The model schedules these on behalf of users via the
 * `set_reminder` tool. A cron job (src/Events/Client/reminderCron.ts) polls
 * once a minute for rows where `delivered=false` AND `dueAt<=now()` and fires
 * them into the originating channel.
 *
 * Time is stored as UTC `Date`; per-user display conversion to the caller's
 * IANA timezone happens at read time.
 */
export const schema = {
    // Who set the reminder + who gets pinged. Always the same user (V1: self-only).
    userId: { type: String, required: true, index: true },

    // Where to deliver. Required even in DMs (DM channels also have IDs).
    channelId: { type: String, required: true },

    // Nullable for DM-scoped reminders (no guild).
    guildId: { type: String, default: null },

    // Reminder body. Capped client-side; we store as-is and let Discord enforce
    // its own 2000-char cap on send.
    content: { type: String, required: true },

    // When to fire. UTC. The compound index below is the hot path for the
    // delivery cron's scan.
    dueAt: { type: Date, required: true },

    // Set to true after a successful (or terminally-failed) delivery so the
    // cron's scan stays cheap. We never retry: a failed send marks delivered
    // with `deliveryError` so we don't loop forever on a broken channel.
    delivered: { type: Boolean, default: false },

    createdAt: { type: Date, default: Date.now },
    deliveredAt: { type: Date },
    deliveryError: { type: String },
};

export const reminderSchema = new Schema(schema);

// Hot path: cron poll. {delivered:false, dueAt:<=now} → take.
reminderSchema.index({ delivered: 1, dueAt: 1 });
// List by user (active first).
reminderSchema.index({ userId: 1, delivered: 1, dueAt: 1 });

export type ReminderSchemaType = InferSchemaType<typeof reminderSchema>;
