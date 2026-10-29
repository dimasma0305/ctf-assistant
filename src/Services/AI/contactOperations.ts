import { ContactOperationModel } from '../../Database/connect';
import type { ChatMessage } from './discordAccess';
import { CREATOR_DISCORD_ID } from './creatorAccess';

export interface ContactRecipient {
    userId: string; content: string; state: 'pending' | 'sending' | 'sent' | 'failed';
    messageId?: string; error?: string; lastAttemptMessageId?: string;
}
export interface ContactOperation {
    operationId: string; ownerId: string; guildId: string; channelId: string;
    requestMessageId: string; requestText: string; mode: 'dm' | 'channel';
    sourceListMessageId?: string; includeCreator: boolean; excludedUserIds: string[];
    recipients: ContactRecipient[]; createdAt: Date; updatedAt: Date; expiresAt: Date;
}

// Test-only storage. Production never sends when durable storage is unavailable.
const memory = new Map<string, ContactOperation>();
const scope = (message: ChatMessage) => ({ ownerId: message.author.id, guildId: message.guildId || '', channelId: message.channelId });
const belongs = (op: ContactOperation, message: ChatMessage) => Object.entries(scope(message)).every(([key, value]) => op[key as keyof ContactOperation] === value)
    && new Date(op.expiresAt).getTime() > Date.now();
export const isContactCreator = (message: ChatMessage) => message.author.id === CREATOR_DISCORD_ID
    && !message.author.bot && !message.webhookId && !message.system;

export async function loadContactOperations(message: ChatMessage, operationId?: string): Promise<ContactOperation[]> {
    if (!isContactCreator(message)) return [];
    if (process.env.NODB === 'true') return structuredClone([...memory.values()].filter(op => belongs(op, message)
        && (!operationId || op.operationId === operationId)).sort((a, b) => +b.createdAt - +a.createdAt || b.requestMessageId.localeCompare(a.requestMessageId)).slice(0, 3));
    return await ContactOperationModel.find({ ...scope(message), expiresAt: { $gt: new Date() }, ...(operationId ? { operationId } : {}) })
        .sort({ createdAt: -1, requestMessageId: -1 }).limit(3).maxTimeMS(2000).lean() as ContactOperation[];
}

export async function prepareContactOperation(message: ChatMessage, mode: 'dm' | 'channel', entries: [string, string][],
    metadata: Pick<ContactOperation, 'sourceListMessageId' | 'includeCreator' | 'excludedUserIds'>): Promise<ContactOperation> {
    if (!isContactCreator(message)) throw new Error('creator_only');
    // The request message and delivery mode define one action, even after restart.
    const operationId = `${message.id}-${mode}`;
    const now = new Date();
    const operation: ContactOperation = { operationId, ...scope(message), requestMessageId: message.id,
        requestText: (message.content || '').slice(0, 2400), mode, ...metadata,
        recipients: entries.map(([userId, content]) => ({ userId, content, state: 'pending' })),
        createdAt: now, updatedAt: now, expiresAt: new Date(+now + 30 * 86_400_000) };
    if (process.env.NODB === 'true') {
        if (!memory.has(operationId)) memory.set(operationId, operation);
        while (memory.size > 1000) memory.delete(memory.keys().next().value!);
        const existing = memory.get(operationId)!;
        if (!belongs(existing, message)) throw new Error('operation_scope_mismatch');
        return structuredClone(existing);
    }
    try {
        return await ContactOperationModel.findOneAndUpdate({ operationId, ...scope(message) }, { $setOnInsert: operation },
            { upsert: true, new: true, maxTimeMS: 2000 }).lean() as ContactOperation;
    } catch (error: any) {
        if (error?.code !== 11000) throw error;
        const existing = (await loadContactOperations(message, operationId))[0];
        if (!existing) throw error;
        return existing;
    }
}

/** Claim before delivery. A crash after sending leaves 'sending' (unknown),
 * never eligible for automatic retry: a missing receipt is not proof of failure. */
export async function claimContactRecipient(message: ChatMessage, operation: ContactOperation, index: number, retry: boolean): Promise<boolean> {
    const recipient = operation.recipients[index];
    const expected = retry ? 'failed' : 'pending';
    if (process.env.NODB === 'true') {
        const stored = memory.get(operation.operationId);
        const item = stored?.recipients[index];
        if (!stored || !belongs(stored, message) || item?.userId !== recipient.userId || item.state !== expected || item.lastAttemptMessageId === message.id) return false;
        item.state = 'sending'; item.lastAttemptMessageId = message.id; stored.updatedAt = new Date();
        return true;
    }
    const result = await ContactOperationModel.updateOne({ ...scope(message), operationId: operation.operationId,
        expiresAt: { $gt: new Date() }, [`recipients.${index}.userId`]: recipient.userId,
        [`recipients.${index}.state`]: expected, [`recipients.${index}.lastAttemptMessageId`]: { $ne: message.id },
    }, { $set: { [`recipients.${index}.state`]: 'sending', [`recipients.${index}.lastAttemptMessageId`]: message.id, updatedAt: new Date() } }, { maxTimeMS: 2000 });
    return result.modifiedCount === 1;
}

export async function recordContactRecipient(message: ChatMessage, operation: ContactOperation, index: number,
    result: { ok: boolean; messageId?: string; error?: string }): Promise<void> {
    const changes = { state: result.ok ? 'sent' as const : 'failed' as const, messageId: result.messageId || '', error: result.error || '' };
    if (process.env.NODB === 'true') {
        const stored = memory.get(operation.operationId);
        if (!stored || !belongs(stored, message) || stored.recipients[index]?.lastAttemptMessageId !== message.id) throw new Error('stale_receipt');
        Object.assign(stored.recipients[index], changes); stored.updatedAt = new Date(); return;
    }
    const resultWrite = await ContactOperationModel.updateOne({ ...scope(message), operationId: operation.operationId,
        [`recipients.${index}.state`]: 'sending', [`recipients.${index}.lastAttemptMessageId`]: message.id,
    }, { $set: { ...Object.fromEntries(Object.entries(changes).map(([key, value]) => [`recipients.${index}.${key}`, value])), updatedAt: new Date() } }, { maxTimeMS: 2000 });
    if (resultWrite.modifiedCount !== 1) throw new Error('receipt_not_saved');
}

export function contactOperationSummary(operation: ContactOperation) {
    return { operationId: operation.operationId, mode: operation.mode, requestMessageId: operation.requestMessageId,
        sourceListMessageId: operation.sourceListMessageId, includeCreator: operation.includeCreator,
        excludedUserIds: operation.excludedUserIds, createdAt: operation.createdAt,
        recipients: operation.recipients.map(({ userId, state, messageId, error }) => ({ userId, state, messageId, error })),
        deliveredCount: operation.recipients.filter(item => item.state === 'sent').length,
        failedCount: operation.recipients.filter(item => item.state === 'failed').length,
        pendingCount: operation.recipients.filter(item => item.state === 'pending').length,
        unknownCount: operation.recipients.filter(item => item.state === 'sending').length };
}
