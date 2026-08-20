import { FetchCommandModel, TrakteerModel } from "../../Database/connect";
import { encryptJson, encryptSecret, isEncryptedSecret } from "../../utils/secretBox";

/** Encrypt legacy integration credentials in place before any cron can use them. */
export async function migrateIntegrationSecrets(): Promise<void> {
    let migrated = 0;

    const trakteer = await TrakteerModel.find({}, { api_key: 1 }).lean();
    const trakteerOps = trakteer
        .filter((doc: any) => typeof doc.api_key === "string" && !isEncryptedSecret(doc.api_key))
        .map((doc: any) => ({
            updateOne: {
                filter: { _id: doc._id },
                update: { $set: { api_key: encryptSecret(doc.api_key) } },
            },
        }));
    if (trakteerOps.length) {
        await TrakteerModel.bulkWrite(trakteerOps as any);
        migrated += trakteerOps.length;
    }

    const fetchCommands = await FetchCommandModel.find({}, { url: 1, headers: 1, body: 1 }).lean();
    const fetchOps = fetchCommands.flatMap((doc: any) => {
        const set: Record<string, unknown> = {};
        if (typeof doc.url === "string" && !isEncryptedSecret(doc.url)) set.url = encryptSecret(doc.url);
        if (doc.headers !== undefined && !isEncryptedSecret(doc.headers)) set.headers = encryptJson(doc.headers);
        if (typeof doc.body === "string" && !isEncryptedSecret(doc.body)) set.body = encryptSecret(doc.body);
        if (!Object.keys(set).length) return [];
        return [{ updateOne: { filter: { _id: doc._id }, update: { $set: set } } }];
    });
    if (fetchOps.length) {
        await FetchCommandModel.bulkWrite(fetchOps as any);
        migrated += fetchOps.length;
    }

    if (migrated) console.log(`[Security] encrypted ${migrated} legacy integration record(s)`);
}
