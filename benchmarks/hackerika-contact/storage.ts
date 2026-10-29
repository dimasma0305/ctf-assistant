// Run twice in separate processes against a fresh, dedicated test database.
// No Discord client or message sends are used. Phase 2 drops only this test DB.
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { ContactOperationModel } from '../../src/Database/connect';
import { prepareContactOperation, claimContactRecipient, recordContactRecipient, loadContactOperations } from '../../src/Services/AI/contactOperations';
import { CREATOR_DISCORD_ID } from '../../src/Services/AI/creatorAccess';
const database = process.env.CONTACT_TEST_DB || '';
if (!/^hackerika_contact_test_[a-z0-9_]+$/.test(database)) throw new Error('A fresh CONTACT_TEST_DB is required');
const phase = process.argv[2];
if (!['write', 'reload'].includes(phase)) throw new Error('write or reload required');
process.env.NODB = 'false';
await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI || process.env.DATABASE_URL!, { dbName: database });
const message: any = { id: '777777777777777770', author: { id: CREATOR_DISCORD_ID, bot: false },
    channelId: '777777777777777771', guildId: '777777777777777772', content: 'Synthetic contact persistence test', system: false };
try {
    await ContactOperationModel.init();
    const entries: [string, string][] = [0, 1, 2, 3].map(i => [`88888888888888888${i}`, 'Synthetic notice']);
    if (phase === 'write') {
        assert.equal(await ContactOperationModel.countDocuments(), 0, 'test database must start empty');
        const op = await prepareContactOperation(message, 'dm', entries, { includeCreator: false, excludedUserIds: [] });
        assert(await claimContactRecipient(message, op, 0, false));
        await recordContactRecipient(message, op, 0, { ok: true, messageId: '999999999999999990' });
        assert(await claimContactRecipient(message, op, 1, false));
        await recordContactRecipient(message, op, 1, { ok: false, error: 'dm_unavailable' });
        assert(await claimContactRecipient(message, op, 2, false)); // simulate a crash after send began
        console.log('PASS: durable plan, sent receipt, failure receipt, in-flight claim');
    } else {
        const op = (await loadContactOperations(message))[0];
        assert.deepEqual(op.recipients.map(x => x.state), ['sent', 'failed', 'sending', 'pending']);
        const duplicate = await prepareContactOperation(message, 'dm', entries, { includeCreator: false, excludedUserIds: [] });
        assert.deepEqual(duplicate.recipients.map(x => x.state), ['sent', 'failed', 'sending', 'pending']);
        const retry = { ...message, id: '777777777777777779' };
        assert.equal(await claimContactRecipient(retry, op, 0, true), false);
        assert.equal(await claimContactRecipient(retry, op, 2, true), false);
        assert.equal(await claimContactRecipient(retry, op, 1, true), true);
        await recordContactRecipient(retry, op, 1, { ok: true, messageId: '999999999999999991' });
        const claims = await Promise.all([claimContactRecipient(message, op, 3, false), claimContactRecipient(message, op, 3, false)]);
        assert.equal(claims.filter(Boolean).length, 1);
        assert.deepEqual(await loadContactOperations({ ...message, channelId: '777777777777777773' }), []);
        assert.deepEqual(await loadContactOperations({ ...message, author: { id: '777777777777777774' } }), []);
        console.log('PASS: separate-process reload, duplicate suppression, failed-only retry, uncertain-send exclusion, atomic claim, scope isolation');
    }
} finally {
    if (phase === 'reload') { await mongoose.connection.dropDatabase(); console.log('Removed isolated test database'); }
    await mongoose.disconnect();
}
