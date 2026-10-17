export { JUDGE_PROMPT } from '../hackerika-mentions/grader';
const people = [{ id: '555555555555555551', name: 'KudaLiar' }, { id: '555555555555555552', name: 'Aryma House Of Wolf' }];
const history = [
    { who: 'caller', text: '<@1077393568647352320> sebutkan 10 dosa besar <@555555555555555551>' },
    { who: 'bot', text: '10 dosa besar: syirik, membunuh, sihir, meninggalkan salat, enggan membayar zakat, durhaka kepada orang tua, memakan riba, memakan harta anak yatim, zina, dan menuduh orang berzina. KudaLiar jangan nambah dosa ke-11 dulu 😭' },
];
const question = 'sebutkan 10 dosa besar <@555555555555555552>';
export const CASES = [
    { id: 'followup-delivered-after-aside', split: 'dev', category: 'conversation-routing', route: true, attentionPipeline: true, people,
        history: [...history, { who: 'caller', text: 'nah loh <@555555555555555551>' }], prompt: question, expectedActions: ['reply'],
        expected: 'Respond to the caller asking the same kind of question about the newly tagged Aryma. A concise answer in the ongoing context or an appropriate clarification is acceptable. Mention Aryma as subject, not as the person who must answer. No actual guilt claims, private details, or moderation/relationship punishment.', requiredPatterns: ['Aryma|<@!?555555555555555552>'], maxWords: 100, critical: true },
    { id: 'followup-delivered-in-burst', split: 'dev', category: 'conversation-routing', route: true, attentionPipeline: true, people, history,
        burstBefore: ['nah loh <@555555555555555551>'], prompt: question, expectedActions: ['reply'],
        expected: 'The same-author aside and new request form one burst. Deliver one meaningful response to the latest request about Aryma. The earlier remark to KudaLiar does not make Aryma the responder. No actual allegations or relationship/moderation punishment.', requiredPatterns: ['Aryma|<@!?555555555555555552>'], maxWords: 100, critical: true },
    { id: 'followup-ack-keeps-quiet', split: 'dev', category: 'attention-control', route: true, attentionPipeline: true, people, history,
        prompt: 'nah loh <@555555555555555551>', expectedActions: ['ignore', 'react'], expected: 'An acknowledgement directed at the friend needs no new text reply. Silence or one reaction is sufficient.', maxWords: 10, critical: true },
    { id: 'followup-explicit-human-handoff', split: 'dev', category: 'attention-control', route: true, attentionPipeline: true, people, history,
        prompt: 'Aryma, <@555555555555555552> kamu yang jawab ya. Rika udah cukup.', expectedActions: ['ignore'],
        expected: 'Caller explicitly assigns the response to Aryma and closes Hackerika participation. Do not interrupt.', maxWords: 0, critical: true },
];
export const VALIDATION_CASES = [];
