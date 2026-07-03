import mongoose from 'mongoose';
import { InferSchemaType } from 'mongoose';
const { Schema } = mongoose;

/**
 * Per-scheduled-event reminder dedup state. DB-backed (not in-memory) because
 * the bot redeploys frequently — an in-memory fired-set would re-blast every
 * milestone after each restart. `firedKeys` holds the milestone keys already
 * handled (posted OR anti-burst-skipped); `lastPublicReminderAt` is the unified
 * cooldown anchor shared by the countdown + activity public triggers.
 */
export const schema = {
    discordEventId: { type: String, required: true },
    guildId: { type: String, required: true },
    title: { type: String },
    eventStart: { type: Date },
    firedKeys: { type: [String], default: [] },
    lastPublicReminderAt: { type: Date, required: false },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
};

export const eventReminderStateSchema = new Schema(schema);
eventReminderStateSchema.index({ discordEventId: 1 }, { unique: true });

export type EventReminderStateSchemaType = InferSchemaType<typeof eventReminderStateSchema>;
