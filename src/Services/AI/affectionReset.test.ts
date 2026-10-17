process.env.NODB = 'true';

import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { AffectionResetModel, UserProfileModel } from '../../Database/connect';
import { AFFECTION_RESET_VERSION as version } from '../../Database/affectionResetSchema';
import { resetAffectionOnce } from './affectionReset';

const spies: { mockRestore(): void }[] = [];
afterEach(() => { for (const spy of spies.splice(0)) spy.mockRestore(); });
function fixture() {
    const requestedAt = new Date();
    const profiles: any[] = [{ userId: 'a', affection: 70, previousAffection: 65, trust: 80, respect: 50, comfort: 60, chemistry: 40,
        affectionResetVersion: 'discord-attention-2026-10-15', moments: ['existing memory'] },
        { userId: 'b', affection: -90, previousAffection: -90, trust: -100, respect: -100, comfort: -99, chemistry: -97,
            affectionResetVersion: 'discord-attention-2026-10-15', moments: [] }];
    const marker: any = { key: version, requestedAt, appliedAt: null, affectedProfiles: 0 };
    let failMarker = false;
    const query = (resolve: () => any): any => ({ lean() { return this; }, setOptions() { return this; }, maxTimeMS() { return this; }, exec: async () => resolve() });
    spies.push(spyOn(AffectionResetModel, 'init').mockImplementation((async () => AffectionResetModel) as any));
    spies.push(spyOn(AffectionResetModel, 'findOneAndUpdate').mockImplementation((() => query(() => ({ ...marker }))) as any));
    spies.push(spyOn(UserProfileModel, 'updateMany').mockImplementation(((_filter: any, update: any) => query(() => {
        const targets = profiles.filter(profile => profile.affectionResetVersion !== version);
        for (const profile of targets) Object.assign(profile, update.$set);
        return { modifiedCount: targets.length };
    })) as any));
    spies.push(spyOn(UserProfileModel, 'countDocuments').mockImplementation((() => query(() => profiles.filter(profile => profile.affectionResetAt === requestedAt).length)) as any));
    spies.push(spyOn(AffectionResetModel, 'updateOne').mockImplementation(((_filter: any, update: any) => query(() => {
        if (failMarker) throw new Error('interrupted after profile writes');
        Object.assign(marker, update.$set); return {};
    })) as any));
    return { profiles, marker, interrupt: () => { failMarker = true; }, recover: () => { failMarker = false; } };
}

describe('one-time affection reset', () => {
    test('resets all relationship scores, including legacy negative trust that could restore minus ninety', async () => {
        const { profiles } = fixture();
        expect(await resetAffectionOnce()).toEqual({ applied: true, affectedProfiles: 2 });
        expect(profiles.map(profile => [profile.affection, profile.previousAffection, profile.trust, profile.respect, profile.comfort, profile.chemistry]))
            .toEqual([[0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0]]);
        expect(profiles.every(profile => profile.affectionResetVersion === version)).toBe(true);
        expect(profiles[0].moments).toEqual(['existing memory']);
    });
    test('another startup does not erase affection rebuilt after the reset', async () => {
        const { profiles } = fixture(); await resetAffectionOnce(); profiles[0].affection = 4; profiles[0].trust = 3;
        expect(await resetAffectionOnce()).toEqual({ applied: false, affectedProfiles: 2 });
        expect(profiles[0].affection).toBe(4);
        expect(profiles[0].trust).toBe(3);
    });
    test('an interrupted migration resumes without repeating per-profile resets', async () => {
        const { profiles, interrupt, recover } = fixture(); interrupt();
        await expect(resetAffectionOnce()).rejects.toThrow('interrupted');
        profiles[0].affection = 3; recover();
        expect(await resetAffectionOnce()).toEqual({ applied: true, affectedProfiles: 2 });
        expect(profiles[0].affection).toBe(3);
    });
});
