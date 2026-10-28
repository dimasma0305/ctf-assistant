import { expect, test } from 'bun:test';
import { formatRelationshipEvaluationTranscript, validateRelationshipEvaluation } from './relationshipEvaluation';

const baseline = { affection: 3, trust: 0, respect: 1, comfort: 2, chemistry: 3 };
test('fresh messages are visibly separate from old context and other speakers', () => {
    const turns = Array.from({ length: 10 }, (_, i) => ({ role: 'user', authorId: 'target', messageId: `old-${i}`, text: 'old', contextOnly: true }));
    const data = JSON.parse(formatRelationshipEvaluationTranscript('target', JSON.stringify({ targetUserId: 'target', turns: [
        ...turns, { role: 'user', authorId: 'target', messageId: 'fresh', text: 'care', sources: [{ authorId: 'other', messageId: 'quoted' }] },
        { role: 'assistant', contextOnly: true, text: 'reply' },
        { role: 'user', authorId: 'other', messageId: 'foreign', text: 'insult' },
    ] })));
    expect(data.priorContext.map((x: any) => x.messageId)).toEqual(['old-7', 'old-8', 'old-9']);
    expect(data.newExchanges).toEqual([{ messageId: 'fresh', authorId: 'target', text: 'care', sources: [{ authorId: 'other', messageId: 'quoted' }], assistantReplyContext: 'reply' }]);
    expect(() => formatRelationshipEvaluationTranscript('different-user', JSON.stringify({ targetUserId: 'target', turns }))).toThrow();
});
test('only an explicit complete unchanged judgment may omit evidence', () => {
    expect(validateRelationshipEvaluation(baseline, { ...baseline, relationshipEvidenceMessageIds: [] }, false))
        .toEqual({ valid: true, changed: false });
    for (const proposal of [null, [], {}, { affection: 3 }, { ...baseline },
        { ...baseline, affection: '3', relationshipEvidenceMessageIds: [] },
        { ...baseline, affection: NaN, relationshipEvidenceMessageIds: [] },
        { ...baseline, trust: Infinity, relationshipEvidenceMessageIds: [] },
        { ...baseline, comfort: 2.5, relationshipEvidenceMessageIds: [] },
        { ...baseline, chemistry: 101, relationshipEvidenceMessageIds: ['fresh'] }]) {
        expect(validateRelationshipEvaluation(baseline, proposal, true).valid).toBe(false);
    }
});

test('a score change or nonempty evidence list requires validated ownership', () => {
    for (const ids of [[], ['old'], ['other-user'], ['fresh', 'other-user']]) {
        expect(validateRelationshipEvaluation(baseline, { ...baseline, affection: 4, relationshipEvidenceMessageIds: ids }, false).valid).toBe(false);
    }
    expect(validateRelationshipEvaluation(baseline, { ...baseline, relationshipEvidenceMessageIds: ['old'] }, false).valid).toBe(false);
    expect(validateRelationshipEvaluation(baseline, { ...baseline, affection: 4, relationshipEvidenceMessageIds: ['fresh'] }, true))
        .toEqual({ valid: true, changed: true });
});
