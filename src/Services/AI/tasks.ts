import { OmitPartialGroupDMChannel, Message as DiscordMessage } from "discord.js";
import { TaskModel } from "../../Database/connect";
import { TASK_STATUSES, TASK_RECURRENCE, TaskStatus, TaskRecurrence } from "../../Database/taskSchema";

/**
 * Persistent Task service — the foundation of Hackerika's "agent" capability.
 *
 * Tasks are distinct from Reminders:
 *   - Reminder = atomic timed notification (one-shot)
 *   - Task    = ongoing work she pursues across sessions, with status + notes
 *
 * V1 surface:
 *   - 4 native tools (create / list / update / complete)
 *   - 1 daily follow-up cron picks one stalled active task per user and
 *     drafts a proactive message
 */

const MAX_DESCRIPTION_CHARS = 300;
const MAX_NOTE_CHARS = 300;
const MAX_NOTES = 20;
const MAX_ACTIVE_PER_USER = 20;

const VALID_STATUSES = new Set<TaskStatus>(TASK_STATUSES as any);
const VALID_RECURRENCES = new Set<TaskRecurrence>(TASK_RECURRENCE as any);

function truncate(s: string, n: number): string {
    if (!s) return '';
    return s.length <= n ? s : s.slice(0, n - 1) + '…';
}

function relativeAge(d: Date | string | undefined): string {
    if (!d) return '';
    const t = (d instanceof Date ? d : new Date(d)).getTime();
    if (!Number.isFinite(t)) return '';
    const diffMs = Date.now() - t;
    const days = Math.floor(diffMs / 86_400_000);
    if (days <= 0) {
        const hours = Math.floor(diffMs / 3_600_000);
        return hours <= 0 ? 'just now' : `${hours}h ago`;
    }
    if (days < 14) return `${days}d ago`;
    const weeks = Math.floor(days / 7);
    return `${weeks}w ago`;
}

/* ────────────────── Public reads (used by ctx builder + cron) ────────────────── */

/**
 * Load active tasks for a user. Used by chat.ts to inject a compact list
 * into the per-turn ctx block, and by the follow-up cron to pick candidates.
 */
export async function loadActiveTasksForUser(userId: string, limit = 5): Promise<any[]> {
    try {
        return await TaskModel.find({
            userId,
            status: { $in: ['pending', 'in_progress'] },
        })
            .sort({ lastWorkedOn: -1 })
            .limit(limit)
            .lean();
    } catch (error) {
        console.error('[Task] load failed:', error);
        return [];
    }
}

/**
 * Compact one-line-per-task format suitable for the ctx block. Empty string
 * when the user has nothing active.
 */
export function formatActiveTasksBlock(tasks: any[]): string {
    if (!tasks || tasks.length === 0) return '';
    const lines = tasks.map((t) => {
        const due = t.dueAt ? ` (due ${relativeAge(t.dueAt).replace(' ago', ' from now').replace('just now', 'soon')})` : '';
        const rec = t.recurrence && t.recurrence !== 'none' ? ` [${t.recurrence}]` : '';
        const lastTouch = t.lastWorkedOn ? ` — last touched ${relativeAge(t.lastWorkedOn)}` : '';
        const noteCount = Array.isArray(t.notes) ? t.notes.length : 0;
        const notes = noteCount > 0 ? ` (${noteCount} note${noteCount === 1 ? '' : 's'})` : '';
        return `- ${String(t._id).slice(-6)}: ${t.description}${due}${rec}${notes}${lastTouch}`;
    });
    return lines.join('\n');
}

/* ────────────────── Tool: create_task ────────────────── */

export interface CreateTaskArgs {
    description?: string;
    dueAtISO?: string;
    recurrence?: string;
    initialNote?: string;
}
export interface CreateTaskResult {
    ok: boolean;
    error?: 'missing_description' | 'invalid_dueAt' | 'invalid_recurrence' | 'quota_exceeded' | 'db_error';
    taskId?: string;
    description?: string;
    recurrence?: TaskRecurrence;
}

export async function createTaskForTool(
    message: OmitPartialGroupDMChannel<DiscordMessage<boolean>>,
    args: CreateTaskArgs,
): Promise<CreateTaskResult> {
    const desc = (args?.description || '').trim();
    if (!desc) return { ok: false, error: 'missing_description' };
    const description = truncate(desc, MAX_DESCRIPTION_CHARS);

    let dueAt: Date | undefined;
    if (typeof args?.dueAtISO === 'string' && args.dueAtISO.trim().length > 0) {
        const t = new Date(args.dueAtISO);
        if (isNaN(t.getTime())) return { ok: false, error: 'invalid_dueAt' };
        dueAt = t;
    }

    const recurrence: TaskRecurrence = (args?.recurrence && VALID_RECURRENCES.has(args.recurrence as TaskRecurrence))
        ? (args.recurrence as TaskRecurrence)
        : 'none';

    try {
        const active = await TaskModel.countDocuments({
            userId: message.author.id,
            status: { $in: ['pending', 'in_progress'] },
        });
        if (active >= MAX_ACTIVE_PER_USER) return { ok: false, error: 'quota_exceeded' };
    } catch (error) {
        console.error('[Task] quota check failed:', error);
        return { ok: false, error: 'db_error' };
    }

    const initialNotes: any[] = [];
    if (typeof args?.initialNote === 'string' && args.initialNote.trim().length > 0) {
        initialNotes.push({ text: truncate(args.initialNote.trim(), MAX_NOTE_CHARS), addedAt: new Date() });
    }

    let doc: any;
    try {
        doc = await TaskModel.create({
            userId: message.author.id,
            channelId: message.channel.id,
            guildId: message.guild?.id ?? null,
            description,
            status: 'pending',
            dueAt,
            recurrence,
            notes: initialNotes,
            lastWorkedOn: new Date(),
        });
    } catch (error) {
        console.error('[Task] create failed:', error);
        return { ok: false, error: 'db_error' };
    }

    console.log(`📋 [Task] created for ${message.author.id}: "${description.slice(0, 60)}" recurrence=${recurrence}`);
    return {
        ok: true,
        taskId: String(doc._id),
        description,
        recurrence,
    };
}

/* ────────────────── Tool: list_tasks ────────────────── */

export interface ListTasksArgs {
    status?: string;
    limit?: number;
}
export interface ListTaskItem {
    taskId: string;
    description: string;
    status: TaskStatus;
    recurrence: TaskRecurrence;
    dueAt?: string;
    lastWorkedOn?: string;
    notes: number;
}
export interface ListTasksResult {
    ok: boolean;
    error?: 'db_error';
    tasks?: ListTaskItem[];
}

export async function listTasksForTool(
    message: OmitPartialGroupDMChannel<DiscordMessage<boolean>>,
    args: ListTasksArgs,
): Promise<ListTasksResult> {
    const userId = message.author.id;
    const limit = Math.max(1, Math.min(20, Number(args?.limit) || 10));
    const filter: any = { userId };
    if (args?.status && VALID_STATUSES.has(args.status as TaskStatus)) {
        filter.status = args.status;
    } else {
        filter.status = { $in: ['pending', 'in_progress'] };
    }
    try {
        const docs = await TaskModel.find(filter)
            .sort({ lastWorkedOn: -1 })
            .limit(limit)
            .lean();
        return {
            ok: true,
            tasks: docs.map((d: any) => ({
                taskId: String(d._id),
                description: d.description,
                status: d.status,
                recurrence: d.recurrence,
                dueAt: d.dueAt ? new Date(d.dueAt).toISOString() : undefined,
                lastWorkedOn: d.lastWorkedOn ? new Date(d.lastWorkedOn).toISOString() : undefined,
                notes: Array.isArray(d.notes) ? d.notes.length : 0,
            })),
        };
    } catch (error) {
        console.error('[Task] list failed:', error);
        return { ok: false, error: 'db_error' };
    }
}

/* ────────────────── Tool: update_task ────────────────── */

export interface UpdateTaskArgs {
    taskId?: string;
    addNote?: string;
    status?: string;
}
export interface UpdateTaskResult {
    ok: boolean;
    error?: 'missing_id' | 'invalid_id' | 'not_found' | 'not_yours' | 'invalid_status' | 'db_error';
}

export async function updateTaskForTool(
    message: OmitPartialGroupDMChannel<DiscordMessage<boolean>>,
    args: UpdateTaskArgs,
): Promise<UpdateTaskResult> {
    const id = (args?.taskId || '').trim();
    if (!id) return { ok: false, error: 'missing_id' };
    if (!/^[a-f0-9]{24}$/i.test(id)) return { ok: false, error: 'invalid_id' };

    let doc: any;
    try {
        doc = await TaskModel.findById(id).lean();
    } catch (error) {
        console.error('[Task] update lookup failed:', error);
        return { ok: false, error: 'db_error' };
    }
    if (!doc) return { ok: false, error: 'not_found' };
    if (doc.userId !== message.author.id) return { ok: false, error: 'not_yours' };

    const update: any = { lastWorkedOn: new Date() };

    if (typeof args?.status === 'string' && args.status) {
        if (!VALID_STATUSES.has(args.status as TaskStatus)) return { ok: false, error: 'invalid_status' };
        update.status = args.status;
        if (args.status === 'done' || args.status === 'cancelled') update.completedAt = new Date();
    }

    if (typeof args?.addNote === 'string' && args.addNote.trim().length > 0) {
        const note = { text: truncate(args.addNote.trim(), MAX_NOTE_CHARS), addedAt: new Date() };
        const existing = Array.isArray(doc.notes) ? doc.notes : [];
        update.notes = [...existing, note].slice(-MAX_NOTES);
    }

    try {
        await TaskModel.updateOne({ _id: id }, { $set: update });
    } catch (error) {
        console.error('[Task] update failed:', error);
        return { ok: false, error: 'db_error' };
    }
    console.log(`📋 [Task] updated ${id.slice(-6)} for ${message.author.id} (status=${update.status || doc.status})`);
    return { ok: true };
}

/* ────────────────── Tool: complete_task ────────────────── */

export interface CompleteTaskArgs {
    taskId?: string;
}
export interface CompleteTaskResult {
    ok: boolean;
    error?: 'missing_id' | 'invalid_id' | 'not_found' | 'not_yours' | 'already_done' | 'db_error';
}

export async function completeTaskForTool(
    message: OmitPartialGroupDMChannel<DiscordMessage<boolean>>,
    args: CompleteTaskArgs,
): Promise<CompleteTaskResult> {
    const id = (args?.taskId || '').trim();
    if (!id) return { ok: false, error: 'missing_id' };
    if (!/^[a-f0-9]{24}$/i.test(id)) return { ok: false, error: 'invalid_id' };

    let doc: any;
    try {
        doc = await TaskModel.findById(id).lean();
    } catch (error) {
        console.error('[Task] complete lookup failed:', error);
        return { ok: false, error: 'db_error' };
    }
    if (!doc) return { ok: false, error: 'not_found' };
    if (doc.userId !== message.author.id) return { ok: false, error: 'not_yours' };
    if (doc.status === 'done') return { ok: false, error: 'already_done' };

    try {
        await TaskModel.updateOne({ _id: id }, {
            $set: { status: 'done', completedAt: new Date(), lastWorkedOn: new Date() },
        });
    } catch (error) {
        console.error('[Task] complete failed:', error);
        return { ok: false, error: 'db_error' };
    }
    console.log(`✅ [Task] completed ${id.slice(-6)} for ${message.author.id}`);
    return { ok: true };
}

/* ────────────────── Follow-up selection (used by cron) ────────────────── */

const STALL_DAYS = 5;            // task is "stalled" after this many days idle
const FOLLOWUP_COOLDOWN_DAYS = 1; // don't follow up the same task twice in <1d

/**
 * Find users with at least one active task that's stalled (idle > STALL_DAYS)
 * and hasn't been followed up recently. Returns one candidate per user
 * (the most stalled task), to bound proactive outreach.
 */
export async function selectFollowupCandidates(): Promise<Array<{
    userId: string;
    channelId: string;
    guildId: string | null;
    task: any;
}>> {
    const stallCutoff = new Date(Date.now() - STALL_DAYS * 86_400_000);
    const cooldownCutoff = new Date(Date.now() - FOLLOWUP_COOLDOWN_DAYS * 86_400_000);
    let stalled: any[] = [];
    try {
        stalled = await TaskModel.find({
            status: { $in: ['pending', 'in_progress'] },
            lastWorkedOn: { $lte: stallCutoff },
            $or: [
                { lastFollowedUpAt: { $exists: false } },
                { lastFollowedUpAt: { $lte: cooldownCutoff } },
            ],
        })
            .sort({ lastWorkedOn: 1 })   // most stalled first
            .lean();
    } catch (error) {
        console.error('[Task] followup query failed:', error);
        return [];
    }
    // Pick one task per user (the most stalled).
    const seen = new Set<string>();
    const out: any[] = [];
    for (const t of stalled) {
        if (seen.has(t.userId)) continue;
        seen.add(t.userId);
        out.push({ userId: t.userId, channelId: t.channelId, guildId: t.guildId, task: t });
    }
    return out;
}

export async function markTaskFollowedUp(taskId: any): Promise<void> {
    try {
        await TaskModel.updateOne({ _id: taskId }, { $set: { lastFollowedUpAt: new Date() } });
    } catch { /* silent */ }
}
