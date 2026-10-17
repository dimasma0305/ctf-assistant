import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { CASES } from './cases';
import { judgeInput } from './judge-input';

test('semantic image judging receives the exact frozen upload and its reply provenance', async () => {
    const scenario = CASES.find(c => c.id === 'reply-image-table')!;
    const bytes = await readFile('benchmarks/hackerika-capabilities/fixtures/table-dev.png');
    const content = await judgeInput(scenario, { text: 'Rp53.000', effects: [], toolCalls: [] }, { fixtures: { 'table-dev.png': createHash('sha256').update(bytes).digest('hex') } });
    expect(content).toHaveLength(2);
    expect(JSON.parse(content[0].text).images[0].source).toBe('replied-to upload');
    expect(Buffer.from(content[1].image_url.url.split(',')[1], 'base64').equals(bytes)).toBe(true);
    await expect(judgeInput(scenario, {}, { fixtures: { 'table-dev.png': 'wrong-generation-fixture' } })).rejects.toThrow('differs from frozen generation fixture');
});
