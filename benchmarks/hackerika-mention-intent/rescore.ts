import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { deterministicGrade } from '../hackerika-capabilities/grader';
import { CASES, JUDGE_PROMPT } from './corpus';
import { CASES as ORIGINAL_CASES, JUDGE_PROMPT as ORIGINAL_JUDGE_PROMPT } from './corpus-v1';

const option = (name: string) => {
    const index = process.argv.indexOf(name);
    return index < 0 ? '' : process.argv[index + 1];
};
const source = option('--run'), out = option('--out');
if (!source || !out || resolve(source) === resolve(out)) throw Error('Use --run ORIGINAL --out FRESH_DIRECTORY');
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const protocol = JSON.parse(await readFile(`${source}/protocol.json`, 'utf8'));
if (protocol.corpusHash !== hash(JSON.stringify(ORIGINAL_CASES))) throw Error('Source is not the original frozen corpus');
if (JUDGE_PROMPT !== ORIGINAL_JUDGE_PROMPT) throw Error('Semantic rubric changed');
for (const [index, test] of CASES.entries()) {
    const original = ORIGINAL_CASES[index];
    const immutable = (item: typeof test) => {
        const { requiredPatterns, expected, ...rest } = item;
        return { ...rest, expected: item.id === 'browser-tab-banter' ? 'see measurement-correction.json' : expected };
    };
    if (!original || JSON.stringify(immutable(test)) !== JSON.stringify(immutable(original))) throw Error('Unapproved corpus change');
}
if (CASES.length !== ORIGINAL_CASES.length) throw Error('Case identities changed');
const originalResults = await readFile(`${source}/results.json`, 'utf8');
const rows = JSON.parse(originalResults);
for (const row of rows) {
    const original = ORIGINAL_CASES.find(test => test.id === row.caseId);
    const revised = CASES.find(test => test.id === row.caseId);
    if (!original || !revised || JSON.stringify(deterministicGrade(original, row)) !== JSON.stringify(row.deterministicFailures)) throw Error('Original grade cannot be reproduced');
    row.deterministicFailures = deterministicGrade(revised, row);
    row.deterministicPass = row.deterministicFailures.length === 0;
}
// Never overwrite recorded model responses or old judgments. No API calls.
await mkdir(out, { recursive: false });
for (const name of ['judgments.json', 'judge-summary.json', 'judge-protocol.json']) {
    await writeFile(`${out}/${name}`, await readFile(`${source}/${name}`));
}
await writeFile(`${out}/results.json`, JSON.stringify(rows, null, 2));
const summary = JSON.parse(await readFile(`${source}/summary.json`, 'utf8'));
await writeFile(`${out}/summary.json`, JSON.stringify({ ...summary,
    deterministicPasses: rows.filter((row: any) => row.deterministicPass).length,
    measurementCorrection: 'Lexical/recipient checks only; no new generations or judgments.' }, null, 2));
await writeFile(`${out}/protocol.json`, JSON.stringify({ ...protocol,
    corpusHash: hash(JSON.stringify(CASES)),
    measurementCorrection: { source, recordedAt: new Date().toISOString(), originalResultsHash: hash(originalResults),
        originalCorpusHash: protocol.corpusHash, audit: 'benchmarks/hackerika-mention-intent/measurement-correction.json',
        retainedSemanticJudgments: true } }, null, 2));
console.log(JSON.stringify({ source, out, samples: rows.length, deterministicPasses: rows.filter((row: any) => row.deterministicPass).length }));
