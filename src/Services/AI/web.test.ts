process.env.NODB = 'true';
import { afterEach, expect, spyOn, test } from 'bun:test';
import { webSearchForTool, webSearchForTurn } from './web';

const originalKey = process.env.OPENAI_API_KEY;
const spies: { mockRestore(): void }[] = [];
afterEach(() => {
    for (const spy of spies.splice(0)) spy.mockRestore();
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
});
const blocks = (results: any[] = [{ type: 'web_search_result', title: 'Primary source', url: 'https://example.com/news', encrypted_content: 'opaque-provider-data' }]) => [
    { type: 'text', text: 'I will search now.' },
    { type: 'server_tool_use', id: 'search-1', name: 'web_search', input: { query: 'query' } },
    { type: 'web_search_tool_result', tool_use_id: 'search-1', content: results },
    { type: 'text', text: 'Verified notes: https://example.com/news' },
];
const mock = (content: any, status = 200) => {
    process.env.OPENAI_API_KEY = 'fixture-no-network';
    const requests: any[] = [];
    spies.push(spyOn(globalThis, 'fetch').mockImplementation((async (url: any, options: any) => {
        requests.push({ url, options });
        return Response.json(content, { status });
    }) as any));
    return requests;
};

test('native search uses the DeepSeek Anthropic endpoint and returns actual sources without encrypted blocks or a search preamble', async () => {
    const requests = mock({ content: blocks() });
    const result = await webSearchForTool({ query: 'current model' });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe('https://api.deepseek.com/anthropic/v1/messages');
    expect(requests[0].options.redirect).toBe('error');
    expect(requests[0].options.headers['x-api-key']).toBe('fixture-no-network');
    expect(JSON.parse(requests[0].options.body).tools[0]).toEqual({ type: 'web_search_20250305', name: 'web_search', max_uses: 1 });
    expect(result.ok).toBe(true);
    expect(result.provider).toBe('deepseek-native');
    expect(result.results?.[0].url).toBe('https://example.com/news');
    expect(JSON.stringify(result)).not.toContain('opaque-provider-data');
    expect(result.summary).not.toContain('I will search');
});

test('model text without a native search and matched source results is never presented as web evidence', async () => {
    mock({ content: [{ type: 'text', text: 'I searched: https://example.com' }] });
    expect((await webSearchForTool({ query: 'query' })).error).toBe('native_search_not_used');
});

test('empty, failed or mismatched native tool results cannot become a successful search', async () => {
    mock({ content: blocks([{ type: 'web_search_tool_result_error', error_code: 'max_uses_exceeded' }]) });
    expect((await webSearchForTool({ query: 'query' })).error).toBe('no_results');
    spies.splice(0).forEach(spy => spy.mockRestore());
    const content: any[] = blocks();
    content[2].tool_use_id = 'unmatched-tool';
    mock({ content });
    expect((await webSearchForTool({ query: 'query' })).error).toBe('no_results');
});

test('credentials in source URL parameters and non-public result links are removed while useful queries remain', async () => {
    mock({ content: blocks([
        { type: 'web_search_result', title: 'One', url: 'https://example.com/news?q=ctf&accessToken=private-value&utm_source=tracking' },
        { type: 'web_search_result', title: 'Duplicate', url: 'https://example.com/news?q=ctf' },
        { type: 'web_search_result', title: 'Private', url: 'http://127.0.0.1/private' },
        { type: 'web_search_result', title: 'Auth', url: 'https://user:pass@example.com/private' },
        { type: 'web_search_result', title: 'Two', url: 'https://example.org/news' },
    ]) });
    const result = await webSearchForTool({ query: 'query', maxResults: 2 });
    expect(result.results?.map(row => row.url)).toEqual(['https://example.com/news?q=ctf', 'https://example.org/news']);
    expect(JSON.stringify(result)).not.toContain('private-value');
});

test('provider authentication or network failures stay explicit with no scraping fallback or leaked error body', async () => {
    const requests = mock({ error: { message: 'sensitive error body' } }, 401);
    expect(await webSearchForTool({ query: 'query' })).toEqual({ ok: false, error: 'http_error', status: 401, provider: 'deepseek-native' });
    expect(requests).toHaveLength(1);
    spies.splice(0).forEach(spy => spy.mockRestore());
    const network = spyOn(globalThis, 'fetch').mockRejectedValue(new Error('sensitive error details'));
    spies.push(network);
    expect((await webSearchForTool({ query: 'query' })).error).toBe('fetch_failed');
    expect(network).toHaveBeenCalledTimes(1);
});

test('invalid queries and missing API configuration do not trigger requests', async () => {
    const requests = mock({});
    expect((await webSearchForTool({})).error).toBe('missing_query');
    expect((await webSearchForTool({ query: 'x'.repeat(501) })).error).toBe('invalid_query');
    delete process.env.OPENAI_API_KEY;
    expect((await webSearchForTool({ query: 'query' })).error).toBe('not_configured');
    expect(requests).toHaveLength(0);
});

test('oversized and malformed provider responses are rejected', async () => {
    mock({ content: blocks(), padding: 'x'.repeat(2 * 1024 * 1024) });
    expect((await webSearchForTool({ query: 'query' })).error).toBe('body_too_large');
    spies.splice(0).forEach(spy => spy.mockRestore());
    mock({ content: 'invalid' });
    expect((await webSearchForTool({ query: 'query' })).error).toBe('invalid_response');
});

test('same-turn repeated and parallel search requests share results, with a two-query ceiling', async () => {
    const requests = mock({ content: blocks() });
    const turn = {};
    const [first, second] = await Promise.all([webSearchForTurn({ query: 'one' }, turn), webSearchForTurn({ query: 'one' }, turn)]);
    expect(first.ok).toBe(true); expect(second).toEqual(first); expect(requests).toHaveLength(1);
    expect((await webSearchForTurn({ query: 'two' }, turn)).ok).toBe(true);
    expect((await webSearchForTurn({ query: 'three' }, turn)).error).toBe('search_budget_exceeded');
    expect(requests).toHaveLength(2);
    expect((await webSearchForTurn({ query: 'one' }, {})).ok).toBe(true);
    expect(requests).toHaveLength(3);
});

test('infrastructure failure blocks further provider requests only for the current turn', async () => {
    const requests = mock({ error: 'unavailable' }, 503);
    const turn = {};
    expect((await webSearchForTurn({ query: 'one' }, turn)).error).toBe('http_error');
    expect((await webSearchForTurn({ query: 'one' }, turn)).error).toBe('search_retry_blocked');
    expect((await webSearchForTurn({ query: 'rephrase' }, turn)).error).toBe('search_retry_blocked');
    expect(requests).toHaveLength(1);
    await webSearchForTurn({ query: 'one' }, {});
    expect(requests).toHaveLength(2);
});
