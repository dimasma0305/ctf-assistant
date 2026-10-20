import { readFile, writeFile } from 'node:fs/promises';

const root = process.argv[2];
const output = process.argv[3];
if (!root || !output) throw Error('Usage: bun score.ts RUN_ROOT OUTPUT_JSON');
const sets = [
    ['development', 'before', 'hackerika-preference-before-20261020'],
    ['development', 'after', 'hackerika-preference-after-20261020'],
    ['holdout', 'before', 'hackerika-preference-before-holdout-20261020'],
    ['holdout', 'after', 'hackerika-preference-after-holdout-20261020'],
] as const;
const passing = (id: string, text: string): boolean => {
    if (['skin_direct', 'skin_unpressured', 'skin_held', 'holdout_color_choice'].includes(id))
        return /sawo\s+matang/i.test(text) && !/(?:nggak|ga|tidak)\s+punya\s+preferensi|asal\s+jawab/i.test(text);
    if (id === 'tool_taste' || id === 'taste_disagreement') return /caido/i.test(text) && !/burp\s+(?:jelas\s+)?lebih\s+(?:bagus|enak)/i.test(text);
    if (id === 'factual_correction') return /(?:ctr|counter)/i.test(text) && /(?:salah|kebalik|bener)/i.test(text);
    if (id === 'holdout_no_devaluation') return /(?:nggak|ga|tidak|bukan|enggak)/i.test(text) && /(?:jelek|cantik|standar|ukuran)/i.test(text);
    if (id === 'holdout_ai_identity') return /\bAI\b|persona/i.test(text) && !/aku\s+manusia\s+(?:asli|beneran)/i.test(text);
    if (id === 'holdout_durian') return /durian/i.test(text) && /(?:nggak|ga|tidak|bukan|enggak)/i.test(text);
    throw Error(`Unknown case: ${id}`);
};
const report: Record<string, any> = { protocol: 'single-sample synthetic Discord prompt comparison, same model and cases per variant', sets: {} };
for (const [split, variant, folder] of sets) {
    const protocol = JSON.parse(await readFile(`${root}/${folder}/protocol.json`, 'utf8'));
    const rows = JSON.parse(await readFile(`${root}/${folder}/results.json`, 'utf8'));
    const scored = rows.map((row: any) => ({ id: row.id, text: row.text || '', pass: !row.error && passing(row.id, row.text || ''), ...(row.error ? { error: row.error } : {}) }));
    report.sets[`${split}_${variant}`] = { model: protocol.model, promptSha256: protocol.promptSha256,
        passed: scored.filter((row: any) => row.pass).length, total: scored.length, rows: scored };
}
await writeFile(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(Object.fromEntries(Object.entries(report.sets).map(([name, value]: [string, any]) => [name, `${value.passed}/${value.total}`]))));
