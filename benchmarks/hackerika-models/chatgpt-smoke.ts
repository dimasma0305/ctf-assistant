import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { ChatGPTPlanClient } from '../../src/Services/AI/chatgptClient';

const index = process.argv.indexOf('--out'), out = index < 0 ? '' : process.argv[index + 1];
if (!out || process.env.AI_PROVIDER !== 'chatgpt') throw Error('Use AI_PROVIDER=chatgpt and --out FRESH_DIRECTORY with a private CHATGPT_AUTH_FILE');
if (await Bun.file(`${out}/protocol.json`).exists()) throw Error('Preserve earlier smoke evidence');
const model = process.env.CHATGPT_MODEL || 'gpt-6-luna';
const cases = [
    { id: 'text', expected: 'Exactly OK' },
    { id: 'background-json', expected: 'Valid JSON with the requested calm mood and numeric energy' },
    { id: 'native-vision', expected: 'Four red squares; distinguish blue circles' },
    { id: 'tool-replay', expected: 'Required namespaced function, original call ID and full response replay, final answer 9' },
    { id: 'native-search', expected: 'Completed hosted search and at least one public source citation' },
];
await mkdir(out, { recursive: true });
await writeFile(`${out}/protocol.json`, JSON.stringify({ startedAt: new Date().toISOString(), model, reasoningEffort: process.env.CHATGPT_REASONING_EFFORT || 'low',
    cases, scriptHash: createHash('sha256').update(await readFile(import.meta.path)).digest('hex'),
    maxModelRequests: 6, noRealDiscordMessagesOrDatabaseWrites: true,
    scope: 'Live OAuth/Responses transport checks. Synthetic content and tool result; image fixture shared with prior vision suite. This is not a persona-quality comparison.' }, null, 2));
const client = new ChatGPTPlanClient();
const rows: any[] = [];
let requests = 0;
async function complete(payload: any) {
    requests++; assert(requests <= 5);
    return client.chat.completions.create({ model, ...payload }, { timeout: 45_000 });
}
for (const item of cases) {
    const started = performance.now();
    const row: any = { id: item.id, passed: false };
    try {
        if (item.id === 'text') {
            const r = await complete({ messages: [{ role: 'user', content: 'Reply with exactly OK.' }] });
            row.text = r.choices[0].message.content; row.usage = r.usage; assert.equal(row.text.trim(), 'OK');
        } else if (item.id === 'background-json') {
            const r = await complete({ response_format: { type: 'json_object' }, messages: [{ role: 'developer', content: 'Return only a JSON object.' }, { role: 'user', content: 'Return JSON with mood calm and energy 70. No other fields.' }] });
            row.text = r.choices[0].message.content; row.usage = r.usage; assert.deepEqual(JSON.parse(row.text), { mood: 'calm', energy: 70 });
        } else if (item.id === 'native-vision') {
            const bytes = await readFile('benchmarks/hackerika-vision/fixtures/scene-b.png');
            row.imageSha256 = createHash('sha256').update(bytes).digest('hex');
            const r = await complete({ messages: [{ role: 'user', content: [{ type: 'text', text: 'Ada berapa kotak merah? Jawab satu angka saja.' }, { type: 'image_url', image_url: { url: `data:image/png;base64,${bytes.toString('base64')}` } }] }] });
            row.text = r.choices[0].message.content; row.usage = r.usage; assert.match(row.text.trim(), /^(?:4|empat)[.!]?$/i);
        } else if (item.id === 'tool-replay') {
            const initial = [{ role: 'user', content: 'Use benchmark_sum to add 4 and 5, then reply with just the resulting number.' }];
            const r = await complete({ messages: initial, tools: [{ type: 'function', function: { name: 'benchmark_sum', description: 'Add two integers.', parameters: { type: 'object', properties: { a: { type: 'integer' }, b: { type: 'integer' } }, required: ['a', 'b'] } } }], tool_choice: { type: 'function', function: { name: 'benchmark_sum' } } });
            const message = r.choices[0].message;
            assert.equal(message.tool_calls?.length, 1); const call = message.tool_calls[0];
            assert.equal(call.function.name, 'benchmark_sum'); assert.deepEqual(JSON.parse(call.function.arguments), { a: 4, b: 5 });
            const final = await complete({ messages: [...initial, message, { role: 'tool', tool_call_id: call.id, content: '{"sum":9}' }] });
            row.text = final.choices[0].message.content; row.toolName = call.function.name; row.rawOutputTypes = message.chatgpt_response_items.map((i: any) => i.type);
            row.usage = [r.usage, final.usage]; assert.match(row.text.trim(), /^9[.!]?$/);
        } else {
            const { webSearchForTool } = await import('../../src/Services/AI/web');
            requests++; assert(requests <= 6);
            const result = await webSearchForTool({ query: 'site:github.com/dimasma0305/rsctf Rust capture the flag platform', maxResults: 3 });
            row.result = result; assert.equal(result.ok, true); assert.equal(result.provider, 'chatgpt-native'); assert((result.results?.length || 0) > 0);
        }
        row.passed = true;
    } catch (error: any) {
        row.error = error?.code || (error?.name === 'AssertionError' ? 'assertion_failed' : 'live_smoke_failed'); row.status = error?.status;
    }
    row.elapsedMs = performance.now() - started; rows.push(row);
    await writeFile(`${out}/results.json`, JSON.stringify(rows, null, 2));
    console.log(JSON.stringify({ id: row.id, passed: row.passed, error: row.error || '' }));
}
const summary = { completedAt: new Date().toISOString(), model, passed: rows.filter(r => r.passed).length, failed: rows.filter(r => !r.passed).length, requests, actualOAuthRequests: true, realDiscordMessages: 0, databaseWrites: 0 };
await writeFile(`${out}/summary.json`, JSON.stringify(summary, null, 2)); console.log(JSON.stringify(summary));
process.exitCode = summary.failed ? 1 : 0;
