import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { CapabilityCase } from './cases';

export const JUDGE_INPUT_VERSION = 'native-fixture-evidence-v1';
export async function judgeInput(test: CapabilityCase, row: any, protocol: { fixtures?: Record<string, string> }) {
    const content: any[] = [{ type: 'text', text: JSON.stringify({ prompt: test.prompt, history: test.history || [], web: test.web || null,
        expected: test.expected, maxWords: test.maxWords, visibleReply: row.text, effects: row.effects, tools: row.toolCalls,
        images: test.images?.map(name => ({ name, source: test.imagesOnReply ? 'replied-to upload' : 'current upload' })) || [] }) }];
    for (const name of test.images || []) {
        const bytes = await readFile(`benchmarks/hackerika-capabilities/fixtures/${name}`);
        if (createHash('sha256').update(bytes).digest('hex') !== protocol.fixtures?.[name]) throw Error('Judge image differs from frozen generation fixture');
        content.push({ type: 'image_url', image_url: { url: `data:image/png;base64,${bytes.toString('base64')}` } });
    }
    return content;
}
