import { expect, test } from 'bun:test';
import { ChatGPTPlanClient, chatGPTRequest, completedResponse } from './chatgptClient';

const completed = (output: any[] = []) => ({ type: 'response.completed', response: { id: 'r_fixture', status: 'completed', output, usage: { input_tokens: 100, output_tokens: 12, total_tokens: 112, input_tokens_details: { cached_tokens: 80 } } } });
function stream(events: any[], tinyChunks = false): Response {
    const bytes = new TextEncoder().encode(events.map(e => `data: ${JSON.stringify(e)}\r\n\r\n`).join(''));
    return new Response(new ReadableStream({ start(controller) { if (tinyChunks) for (const byte of bytes) controller.enqueue(new Uint8Array([byte])); else controller.enqueue(bytes); controller.close(); } }));
}

test('SIWC request preserves images and tool identities while excluding unsupported parameters', () => {
    const request = chatGPTRequest({ model: 'gpt-6-luna', max_tokens: 2300, temperature: 0, reasoning_content: 'private-thought', response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: 'Persona' }, { role: 'user', content: [{ type: 'text', text: 'Ini apa?' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,fixture' } }] },
            { role: 'assistant', content: null, reasoning_content: 'hidden', tool_calls: [{ id: 'call_real_id', function: { name: 'lookup', arguments: '{"q":"x"}' } }] }, { role: 'tool', tool_call_id: 'call_real_id', content: 'evidence' }],
        tools: [{ type: 'function', function: { name: 'lookup', parameters: { type: 'object' } } }] });
    expect(request.store).toBe(false); expect(request.stream).toBe(true); expect(request.input[0].role).toBe('developer');
    expect(request.input[1].content[1]).toEqual({ type: 'input_image', image_url: 'data:image/png;base64,fixture' });
    expect(request.input[2]).toMatchObject({ type: 'function_call', call_id: 'call_real_id', namespace: 'hackerika' });
    expect(request.input[3]).toEqual({ type: 'function_call_output', call_id: 'call_real_id', output: 'evidence' });
    expect(request.tools[0].type).toBe('namespace'); expect(request.text.format.type).toBe('json_object');
    expect(request).not.toHaveProperty('temperature'); expect(request).not.toHaveProperty('max_output_tokens'); expect(JSON.stringify(request)).not.toContain('hidden');
});

test('forced research exposes only its requested function and requires a tool call', () => {
    const request = chatGPTRequest({ model: 'fixture', messages: [], tool_choice: { type: 'function', function: { name: 'research_topic' } },
        tools: ['research_topic', 'delete_message'].map(name => ({ type: 'function', function: { name, parameters: { type: 'object' } } })) });
    expect(request.tool_choice).toBe('required'); expect(request.tools[0].tools.map((t: any) => t.name)).toEqual(['research_topic']);
});

test('stream completion handles split UTF-8/CRLF and requires the terminal success event', async () => {
    const result = await completedResponse(stream([{ type: 'response.output_text.delta', delta: '😭' }, completed([{ type: 'message', content: [{ type: 'output_text', text: '😭 berhasil' }] }])], true));
    expect(result.output[0].content[0].text).toBe('😭 berhasil');
    await expect(completedResponse(stream([{ type: 'response.output_text.delta', delta: 'partial answer' }]))).rejects.toThrow('response_stream_interrupted');
    await expect(completedResponse(stream([{ type: 'response.failed', response: { error: { code: 'subscription_sharing_usage_limit_exceeded', message: 'PRIVATE' } } }]))).rejects.toThrow('subscription_sharing_usage_limit_exceeded');
    await expect(completedResponse(stream([{ type: 'response.incomplete', response: { incomplete_details: { reason: 'max_output_tokens' } } }]))).rejects.toThrow('max_output_tokens');
});

test('tool round trips preserve every reasoning item and map cached usage without exposing thoughts', async () => {
    const requests: any[] = []; const reasoning = { id: 'rs_fixture', type: 'reasoning', summary: [], encrypted_content: 'OPAQUE-REASONING' };
    const auth: any = { credentials: async () => ({ access_token: 'private-token' }) };
    const client = new ChatGPTPlanClient(auth, (async (url: string, init: any) => {
        expect(url).toBe('https://api.openai.com/v1/responses'); expect(init.headers.Authorization).toBe('Bearer private-token'); requests.push(JSON.parse(init.body));
        return requests.length === 1 ? stream([completed([reasoning, { type: 'function_call', namespace: 'hackerika', call_id: 'call_server', name: 'lookup', arguments: '{}' }])])
            : stream([completed([{ type: 'message', content: [{ type: 'output_text', text: 'sudah ketemu' }] }])]);
    }) as any);
    const first = await client.chat.completions.create({ model: 'gpt-6-luna', messages: [{ role: 'user', content: 'cek dong' }] });
    expect(first.choices[0].message.tool_calls[0].id).toBe('call_server'); expect(first.usage.prompt_cache_hit_tokens).toBe(80);
    const second = await client.chat.completions.create({ model: 'gpt-6-luna', messages: [{ role: 'user', content: 'cek dong' }, first.choices[0].message, { role: 'tool', tool_call_id: 'call_server', content: 'source' }] });
    expect(requests[1].input[1]).toEqual(reasoning); expect(requests[1].input[2].call_id).toBe('call_server');
    expect(second.choices[0].message.content).toBe('sudah ketemu'); expect(second.choices[0].message.reasoning_content).toBe('');
});

test('provider errors reveal only safe codes and never retry through a paid fallback', async () => {
    let calls = 0; const client = new ChatGPTPlanClient({ credentials: async () => ({ access_token: 'secret' }) } as any, (async () => { calls++; return new Response(JSON.stringify({ error: { code: 'subscription_sharing_usage_unavailable', message: 'secret' } }), { status: 403 }); }) as any);
    await expect(client.chat.completions.create({ model: 'fixture', messages: [] })).rejects.toThrow('ChatGPT: subscription_sharing_usage_unavailable');
    expect(calls).toBe(1);
});

test('SIWC terminal output omission retains completed message, tool and encrypted reasoning items in output order', async () => {
    const items = [
        { id: 'reason', type: 'reasoning', summary: [], encrypted_content: 'OPAQUE' },
        { id: 'tool', type: 'function_call', namespace: 'hackerika', call_id: 'clock', name: 'get_current_time', arguments: '{}' },
        { id: 'msg', type: 'message', phase: 'final_answer', content: [{ type: 'output_text', text: 'OK', annotations: [] }] },
    ];
    const events = items.map((item, output_index) => ({ type: 'response.output_item.added', output_index, item: { ...item, content: [] } }));
    const done = items.map((item, output_index) => ({ type: 'response.output_item.done', output_index, item })).reverse();
    const result = await completedResponse(stream([...events, ...done, completed([])], true));
    expect(result.output).toEqual(items);
    const client = new ChatGPTPlanClient({ credentials: async () => ({ access_token: 'fake' }) } as any,
        (async () => stream([...events, ...done, completed([])])) as any);
    const response = await client.chat.completions.create({ model: 'gpt-6-luna', messages: [] });
    expect(response.choices[0].message.content).toBe('OK');
    expect(response.choices[0].message.tool_calls[0].id).toBe('clock');
    expect(response.choices[0].message.chatgpt_response_items[0].encrypted_content).toBe('OPAQUE');
});

test('completed stream items never conceal terminal failure, missing items, or interrupted responses', async () => {
    const added = { type: 'response.output_item.added', output_index: 0, item: { type: 'message', content: [] } };
    const done = { type: 'response.output_item.done', output_index: 0, item: { type: 'message', content: [{ type: 'output_text', text: 'partial' }] } };
    await expect(completedResponse(stream([added, done]))).rejects.toThrow('response_stream_interrupted');
    await expect(completedResponse(stream([added, done, { type: 'response.failed', response: { error: { code: 'subscription_sharing_usage_limit_exceeded' } } }]))).rejects.toThrow('subscription_sharing_usage_limit_exceeded');
    await expect(completedResponse(stream([added, completed([])]))).rejects.toThrow('response_output_incomplete');
});
