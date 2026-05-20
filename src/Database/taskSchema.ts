import mongoose from 'mongoose';
import { InferSchemaType } from 'mongoose';
const { Schema } = mongoose;

/**
 * Persistent Task entities — distinct from Reminders.
 *
 * **Reminders** = atomic timed notifications ("ping me in 30 min"). Delivered
 * once, then done. Lives in `reminderSchema`.
 *
 * **Tasks** = ongoing work Hackerika tracks for a user across sessions.
 * She may proactively follow up on tasks daily (taskFollowupCron) when the
 * user has been active and affection >= 30. Tasks have status, recurring
 * rules, and notes that accumulate over time.
 *
 * Example: user says "btw aku mau ningkatin pwn skill" → she creates a
 * recurring task. Each Monday morning she opens with "btw udah sempet liat
 * pwn challenge baru ga minggu ini?" — picking up the thread without being
 * asked.
 */

export const TASK_STATUSES = ['pending', 'in_progress', 'done', 'cancelled'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

// Optional recurring schedule. V1 supports simple intervals so the cron can
// pick the right tasks to surface without an external cron-parser dep.
export const TASK_RECURRENCE = ['none', 'daily', 'weekly', 'biweekly', 'monthly'] as const;
export type TaskRecurrence = (typeof TASK_RECURRENCE)[number];

export const schema = {
    // The user the task is for. Tasks are self-scoped (V1) — no cross-user
    // assignment to avoid permission complexity.
    userId: { type: String, required: true, index: true },

    // Where to deliver follow-up messages. Captured at creation time.
    channelId: { type: String, required: true },
    guildId: { type: String, default: null },

    // What the task IS, in Hackerika's own words. Stored as the model wrote
    // it via the `create_task` tool — meant to be natural ("improve pwn skill"
    // not "OBJECTIVE: PWN_SKILL_INCREMENT").
    description: { type: String, required: true },

    // Status drives both retrieval (list_tasks default filter) and the cron's
    // selection logic (only active tasks get follow-ups).
    status: {
        type: String,
        enum: TASK_STATUSES,
        default: 'pending',
    },

    // Optional one-shot deadline. Independent of recurrence — a recurring
    // task can also have an absolute due date (e.g. "weekly check-in until
    // DEF CON quals on 2026-05-25").
    dueAt: { type: Date },

    // Recurring rule for follow-up cadence. 'none' = one-shot, cron skips it
    // after first follow-up.
    recurrence: {
        type: String,
        enum: TASK_RECURRENCE,
        default: 'none',
    },

    // Last time Hackerika or the user interacted with this task. Updated
    // whenever notes are added or the task is mentioned in conversation.
    // Cron uses this to detect "stalled" tasks (> 5 days idle).
    lastWorkedOn: { type: Date, default: Date.now },

    // Last time the daily cron sent a follow-up about this task. Prevents
    // re-following-up the same day.
    lastFollowedUpAt: { type: Date },

    // Free-form notes accumulated over time. Each entry: { text, addedAt }.
    // Capped at 20 entries (oldest evicted) to bound memory.
    notes: {
        type: [{
            text: { type: String, required: true },
            addedAt: { type: Date, default: Date.now },
        }],
        default: [],
    },

    createdAt: { type: Date, default: Date.now },
    completedAt: { type: Date },
};

export const taskSchema = new Schema(schema);

// Compound index for the cron's primary query: active tasks per user, by
// last-worked-on (oldest first → most stalled get follow-up priority).
taskSchema.index({ userId: 1, status: 1, lastWorkedOn: 1 });
// For list_tasks: active tasks per user sorted by creation.
taskSchema.index({ userId: 1, status: 1, createdAt: -1 });

export type TaskSchemaType = InferSchemaType<typeof taskSchema>;
