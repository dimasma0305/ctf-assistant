import { config } from 'dotenv';
import mongoose from 'mongoose';
import { getMongoUri, isNoDbMode } from '../src/utils/env';
import { resetAffectionOnce } from '../src/Services/AI/affectionReset';
import { AFFECTION_RESET_VERSION } from '../src/Database/affectionResetSchema';

config();

export async function runAffectionReset(): Promise<void> {
    if (isNoDbMode() || !getMongoUri()) throw new Error('A configured MongoDB connection is required for the affection reset.');
    await mongoose.connect(getMongoUri(), { serverSelectionTimeoutMS: 5000, timeoutMS: 8000 });
    try {
        const result = await resetAffectionOnce();
        console.log(JSON.stringify({ resetVersion: AFFECTION_RESET_VERSION, ...result }));
    } finally { await mongoose.disconnect(); }
}

if (import.meta.main) {
    try { await runAffectionReset(); }
    catch { console.error('Affection reset failed. Check MongoDB availability and credentials; no reset success was recorded.'); process.exitCode = 1; }
}
