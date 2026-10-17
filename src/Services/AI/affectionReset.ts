import { AffectionResetModel, UserProfileModel } from '../../Database/connect';
import { AFFECTION_RESET_VERSION } from '../../Database/affectionResetSchema';

/** Idempotent, resumable release migration, before profile distillers start. */
export async function resetAffectionOnce(): Promise<{ applied: boolean; affectedProfiles: number }> {
    await AffectionResetModel.init();
    const marker = await AffectionResetModel.findOneAndUpdate({ key: AFFECTION_RESET_VERSION },
        { $setOnInsert: { key: AFFECTION_RESET_VERSION, requestedAt: new Date() } },
        { upsert: true, new: true, maxTimeMS: 5000, timeoutMS: 8000 }).lean().exec();
    if (marker!.appliedAt) return { applied: false, affectedProfiles: marker!.affectedProfiles };
    // Per-profile version makes a retry after a crash safe: relationships that
    // have already been reset (and may now be rebuilding) are never reset twice.
    await UserProfileModel.updateMany({ affectionResetVersion: { $ne: AFFECTION_RESET_VERSION } },
        { $set: { affection: 0, previousAffection: 0, trust: 0, respect: 0, comfort: 0, chemistry: 0,
            affectionResetVersion: AFFECTION_RESET_VERSION, affectionResetAt: marker!.requestedAt } },
        { maxTimeMS: 5000, timeoutMS: 8000 }).exec();
    const affectedProfiles = await UserProfileModel.countDocuments({ affectionResetVersion: AFFECTION_RESET_VERSION,
        affectionResetAt: marker!.requestedAt }).setOptions({ timeoutMS: 8000 }).maxTimeMS(5000).exec();
    await AffectionResetModel.updateOne({ key: AFFECTION_RESET_VERSION },
        { $set: { appliedAt: new Date(), affectedProfiles } },
        { maxTimeMS: 5000, timeoutMS: 8000 }).exec();
    return { applied: true, affectedProfiles };
}
