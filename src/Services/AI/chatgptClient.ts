import { ChatGPTAuth, ChatGPTError, CHATGPT_RESOURCE } from './chatgptAuth';

type Json = Record<string, any>;
const NAMESPACE = 'hackerika';
const safeCode = (value: unknown, fallback: string) => typeof value === 'string' && /^[\w.-]{1,100}$/.test(value) ? value : fallback;

/** Adapt the existing chat/tool loop to the documented stateless SIWC route. */
export function chatGPTRequest(payload: Json): Json {
    const input: Json[] = [];
    for (const message of payload.messages || []) {
        if (message.role === 'tool') {
            input.push({ type: 'function_call_output', call_id: message.tool_call_id, output: typeof message.content === 'string' ? message.content : JSON.stringify(message.content) });
            continue;
        }
        if (message.role === 'assistant' && Array.isArray(message.chatgpt_response_items)) {
            input.push(...message.chatgpt_response_items); continue;
        }
        const role = message.role === 'system' ? 'developer' : message.role;
        if (!['developer', 'user', 'assistant'].includes(role)) throw new ChatGPTError('unsupported_message_role');
        const content: Json[] = [];
        for (const part of Array.isArray(message.content) ? message.content : [{ type: 'text', text: message.content }]) {
            if (part?.type === 'image_url' && typeof part.image_url?.url === 'string') {
                if (role === 'assistant') throw new ChatGPTError('image_in_assistant_history');
                content.push({ type: 'input_image', image_url: part.image_url.url, ...(part.image_url.detail ? { detail: part.image_url.detail } : {}) });
            } else if (typeof part?.text === 'string' && part.text) content.push({ type: role === 'assistant' ? 'output_text' : 'input_text', text: part.text });
        }
        if (content.length) input.push({ role, content });
        for (const call of message.role === 'assistant' ? message.tool_calls || [] : []) {
            input.push({ type: 'function_call', call_id: call.id, namespace: NAMESPACE, name: call.function.name, arguments: call.function.arguments || '{}' });
        }
    }
    const request: Json = { model: payload.model, input, store: false, stream: true,
        reasoning: { effort: process.env.CHATGPT_REASONING_EFFORT || 'low' } };
    if (payload.response_format?.type === 'json_object') request.text = { format: { type: 'json_object' } };
    let functions = (payload.tools || []).filter((tool: Json) => tool.type === 'function').map((tool: Json) => ({ type: 'function', ...tool.function, strict: false }));
    if (typeof payload.tool_choice === 'object') {
        functions = functions.filter((tool: Json) => tool.name === payload.tool_choice.function?.name);
        if (functions.length !== 1) throw new ChatGPTError('unknown_forced_tool');
        request.tool_choice = 'required';
    } else if (payload.tool_choice) request.tool_choice = payload.tool_choice;
    if (functions.length) request.tools = [{ type: 'namespace', name: NAMESPACE, description: 'Hackerika Discord and research tools. Existing permissions apply.', tools: functions }];
    return request;
}

export async function completedResponse(response: Response, signal?: AbortSignal): Promise<Json> {
    if (!response.ok) {
        // Never retain or throw raw provider bodies: they can echo input/credentials.
        let code: unknown;
        try { code = (await response.json())?.error?.code; } catch {}
        throw new ChatGPTError(safeCode(code, 'request_failed'), response.status);
    }
    const reader = response.body?.getReader();
    if (!reader) throw new ChatGPTError('missing_response_stream');
    const decoder = new TextDecoder(); let buffer = '', bytes = 0;
    // SIWC's terminal response may omit output items (output: []). The complete
    // items arrive in output_item.done; retain them, but release nothing until
    // the whole response has its terminal success event.
    const addedItems = new Set<number>(), doneItems = new Map<number, Json>();
    const event = (block: string): Json | null => {
        const data = block.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
        if (!data || data === '[DONE]') return null;
        let item: Json; try { item = JSON.parse(data); } catch { throw new ChatGPTError('invalid_response_event'); }
        if (item.type === 'response.failed' || item.type === 'response.incomplete' || item.type === 'error') {
            throw new ChatGPTError(safeCode(item.response?.error?.code || item.error?.code || item.code || item.response?.incomplete_details?.reason, 'response_failed'));
        }
        if (item.type === 'response.output_item.added' || item.type === 'response.output_item.done') {
            if (!Number.isInteger(item.output_index) || item.output_index < 0 || item.output_index > 512 || !item.item || typeof item.item.type !== 'string') throw new ChatGPTError('invalid_output_item');
            addedItems.add(item.output_index);
            if (item.type === 'response.output_item.done') doneItems.set(item.output_index, item.item);
        }
        if (item.type !== 'response.completed') return null;
        if (item.response?.status !== 'completed' || !Array.isArray(item.response.output)) throw new ChatGPTError('response_not_completed');
        if (item.response.output.length) return item.response;
        if ([...addedItems].some(index => !doneItems.has(index))) throw new ChatGPTError('response_output_incomplete');
        return { ...item.response, output: [...doneItems.entries()].sort(([a], [b]) => a - b).map(([, value]) => value) };
    };
    try {
        while (true) {
            signal?.throwIfAborted();
            const { value, done } = await reader.read();
            if (value) { bytes += value.byteLength; if (bytes > 8 * 1024 * 1024) throw new ChatGPTError('response_too_large'); }
            buffer += decoder.decode(value, { stream: !done });
            // Normalize CRLF after decoding; retain a trailing CR across chunks.
            buffer = buffer.replace(/\r\n/g, '\n');
            let boundary;
            while ((boundary = buffer.indexOf('\n\n')) >= 0) {
                const block = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
                const completed = event(block); if (completed) return completed;
            }
            if (done) { if (buffer.trim()) { const completed = event(buffer); if (completed) return completed; } break; }
        }
        throw new ChatGPTError('response_stream_interrupted');
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

export class ChatGPTPlanClient {
    readonly chat: { completions: { create: (payload: Json, options?: Json) => Promise<any> } };
    constructor(readonly auth = new ChatGPTAuth(), private fetcher: typeof globalThis.fetch = globalThis.fetch) {
        this.chat = { completions: { create: (payload, options) => this.completion(payload, options) } };
    }

    async response(request: Json, options: { signal?: AbortSignal; timeout?: number } = {}): Promise<Json> {
        const signal = AbortSignal.any([...(options.signal ? [options.signal] : []), AbortSignal.timeout(options.timeout || 120_000)]);
        const credentials = await this.auth.credentials(signal);
        let response: Response;
        try { response = await this.fetcher(`${CHATGPT_RESOURCE}/responses`, { method: 'POST', redirect: 'error', signal,
            headers: { Authorization: `Bearer ${credentials.access_token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...request, store: false, stream: true }) }); }
        catch { throw new ChatGPTError(signal.aborted ? 'request_aborted' : 'request_network_error'); }
        return completedResponse(response, signal);
    }

    async models(): Promise<{ slug: string; display_name: string }[]> {
        const credentials = await this.auth.credentials();
        const response = await this.fetcher(`${CHATGPT_RESOURCE}/models`, { redirect: 'error', signal: AbortSignal.timeout(20_000), headers: { Authorization: `Bearer ${credentials.access_token}` } });
        if (!response.ok) throw new ChatGPTError('model_catalog_unavailable', response.status);
        const data = await response.json();
        if (!Array.isArray(data.models)) throw new ChatGPTError('invalid_model_catalog');
        return data.models.filter((m: Json) => m.visibility === 'list' && typeof m.slug === 'string')
            .map((m: Json) => ({ slug: m.slug, display_name: typeof m.display_name === 'string' ? m.display_name : m.slug }));
    }

    private async completion(payload: Json, options: Json = {}): Promise<Json> {
        const result = await this.response(chatGPTRequest(payload), options);
        const calls = result.output.filter((item: Json) => item.type === 'function_call');
        if (calls.some((item: Json) => item.namespace && item.namespace !== NAMESPACE)) throw new ChatGPTError('unexpected_tool_namespace');
        const messages = result.output.filter((item: Json) => item.type === 'message');
        const final = messages.filter((item: Json) => item.phase === 'final_answer');
        const visible = final.length ? final : messages.filter((item: Json) => item.phase !== 'commentary');
        const text = visible.flatMap((item: Json) => item.content || [])
            .filter((part: Json) => part.type === 'output_text').map((part: Json) => part.text).join('\n');
        const refusal = result.output.some((item: Json) => item.type === 'message' && item.content?.some((p: Json) => p.type === 'refusal'));
        if (!text && !calls.length && !refusal) throw new ChatGPTError('empty_completed_response');
        const message: Json = { role: 'assistant', content: text || (refusal ? 'Aku nggak bisa membantu permintaan itu.' : null), reasoning_content: '',
            chatgpt_response_items: result.output,
            ...(calls.length ? { tool_calls: calls.map((call: Json) => ({ id: call.call_id, type: 'function', function: { name: call.name, arguments: call.arguments } })) } : {}) };
        const usage = result.usage || {}; const cached = usage.input_tokens_details?.cached_tokens || 0;
        return { id: result.id, object: 'chat.completion', model: result.model || payload.model,
            choices: [{ index: 0, message, finish_reason: calls.length ? 'tool_calls' : 'stop' }],
            usage: { prompt_tokens: usage.input_tokens || 0, completion_tokens: usage.output_tokens || 0, total_tokens: usage.total_tokens || 0,
                prompt_cache_hit_tokens: cached, prompt_cache_miss_tokens: Math.max(0, (usage.input_tokens || 0) - cached) } };
    }
}

let client: ChatGPTPlanClient | undefined;
export const getChatGPTClient = () => client ||= new ChatGPTPlanClient();
export const isChatGPTProvider = () => process.env.AI_PROVIDER === 'chatgpt';
