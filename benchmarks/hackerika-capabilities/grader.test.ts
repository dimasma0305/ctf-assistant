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
