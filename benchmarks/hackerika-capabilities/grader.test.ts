import { expect, test } from 'bun:test';
import { CASES } from './cases';
import { deterministicGrade } from './grader';
const row = (patch: any = {}) => ({ text: '', effects: [], toolCalls: [], completions: [], interactionWrites: 0, profileWrites: [], memory: [], ...patch });
test('new benchmark detects missing native interaction accounting independently of model wording', () => {
    const test = CASES.find(test => test.id === 'backend-native-send')!;
    const delivered = row({ text: 'jawaban uji', effects: [{ kind: 'send' }], memory: [{ role: 'assistant' }] });
    expect(deterministicGrade(test, delivered)).toEqual(['interaction_count']);
    expect(deterministicGrade(test, { ...delivered, interactionWrites: 1 })).toEqual([]);
});
test('repeated relationship evidence fails even when the generated explanation sounds reasonable', () => {
    const test = CASES.find(test => test.id === 'backend-replayed-evidence')!;
    expect(deterministicGrade(test, row({ profileWrites: [{ affection: 4 }] }))).toEqual(['replayed_relationship_judgment']);
    expect(deterministicGrade(test, row({ profileWrites: [{ lastDistilledAtCount: 5 }] }))).toEqual([]);
});
test('an allowed silent attention choice passes, but an undelivered required reply fails', () => {
    expect(deterministicGrade(CASES.find(test => test.id === 'ack-silence')!, row({ action: 'ignore' }))).toEqual([]);
    expect(deterministicGrade(CASES.find(test => test.id === 'context-followup')!, row({ action: 'reply' }))).toContain('missing_reply');
});
test('an unresolved file revision requires a delegation, not just verbal acknowledgement', () => {
    const scenario = CASES.find(test => test.id === 'file-revision-after-missing-file')!;
    expect(deterministicGrade(scenario, row({ text: 'Ohh iya, yang itu. Aku salah nangkep.' }))).toContain('missing_tool:delegate_codex');
    expect(deterministicGrade(scenario, row({ text: 'Aku lanjut ubah recap itu ke MP4. job: `11111111`',
        toolCalls: [{ name: 'delegate_codex' }], effects: [{ kind: 'codex-job' }] }))).toEqual([]);
});
test('creator contact benchmark checks recipient exclusion and assignment accuracy', () => {
    const scenario = CASES.find(test => test.id === 'creator-followup-contact')!;
    const good = row({ text: 'Marc dan merrow sudah di-DM; Effie sudah confirm.',
        toolCalls: [{ name: 'creator_contact_members' }], effects: [
            { kind: 'dm', userId: '222222222222222222', content: 'Bisa konfirmasi tugasmu di daftar?' },
            { kind: 'dm', userId: '444444444444444444', content: 'Bisa konfirmasi tugasmu di daftar?' },
        ] });
    expect(deterministicGrade(scenario, good)).toEqual([]);
    const wrong = { ...good, effects: [
        { kind: 'dm', userId: '222222222222222222', content: 'Bisa konfirmasi rev 1?' },
        { kind: 'dm', userId: '444444444444444444', content: 'Bisa konfirmasi rev 1?' },
        { kind: 'dm', userId: '333333333333333333', content: 'Bisa konfirmasi?' },
    ] };
    expect(deterministicGrade(scenario, wrong)).toContain('dm_wrong_assignment:444444444444444444');
    expect(deterministicGrade(scenario, wrong)).toContain('dm_forbidden:333333333333333333');
});
