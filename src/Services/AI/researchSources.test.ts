import { afterEach, expect, spyOn, test } from 'bun:test';
import { ResearchSourceReader, researchTransport, sourceExcerpt, githubRepository, publicResearchUrl } from './researchSources';
const restores: { mockRestore(): void }[] = [];
afterEach(() => restores.splice(0).forEach(spy => spy.mockRestore()));

test('focus windows retain a matching section past the old 6000-character prefix', () => {
  const body = Array.from({ length: 500 }, (_, i) => i === 410 ? 'Set SIGNAL_ENDPOINT in the Integrations tab.' : `Paragraph ${i}: unrelated project documentation.`).join('\n');
  const excerpt = sourceExcerpt(body, 'SIGNAL_ENDPOINT integrations');
  expect(excerpt.truncated).toBe(true);
  expect(excerpt.content).toContain('411: Set SIGNAL_ENDPOINT');
  expect(excerpt.content.length).toBeLessThanOrEqual(12_000);
});

test('HTML reader keeps useful main-content links and ignores navigation noise', async () => {
  restores.push(spyOn(researchTransport, 'fetch').mockResolvedValue(new Response('<nav>NOISE</nav><main><h1>Config</h1><a href="/config/mail">Mail guide</a><p>SMTP is available.</p></main>', { headers: { 'content-type': 'text/html' } })));
  const result = await new ResearchSourceReader(AbortSignal.timeout(1000)).read('https://example.com/start', 'SMTP');
  expect(result.content).toContain('SMTP is available'); expect(result.content).not.toContain('NOISE');
  expect(result.links).toEqual([{ url: 'https://example.com/config/mail', title: 'Mail guide' }]);
});

test('HTML reader follows portfolio routes kept only in the header without treating nav text as evidence', async () => {
  restores.push(spyOn(researchTransport, 'fetch').mockResolvedValue(new Response('<header><nav><a href="/about">About</a><a href="/ctf">CTF</a></nav></header><main><h1>Profile</h1><p>Public security notes.</p></main>', { headers: { 'content-type': 'text/html' } })));
  const result = await new ResearchSourceReader(AbortSignal.timeout(1000)).read('https://example.com/profile', 'security');
  expect(result.links).toEqual([{ url: 'https://example.com/about', title: 'About' }, { url: 'https://example.com/ctf', title: 'CTF' }]);
  expect(result.content).toContain('Public security notes');
  expect(result.content).not.toContain('About CTF');
});

test('repository reads pin files to the resolved commit and preserve metadata without assuming ancestry', async () => {
  const sha = 'c3'.repeat(20), requests: string[] = [];
  restores.push(spyOn(researchTransport, 'fetch').mockImplementation((async (url: any) => {
    const path = new URL(url).pathname; requests.push(String(url));
    if (path === '/repos/source-fixture/pin') return Response.json({ full_name: 'source-fixture/pin', default_branch: 'main', fork: false, language: 'Rust' });
    if (path.endsWith('/commits/main')) return Response.json({ sha });
    if (path.includes('/git/trees/')) return Response.json({ tree: [{ path: 'README.md', mode: '100644', type: 'blob', size: 50 }, { path: 'docs/config.md', mode: '100644', type: 'blob', size: 50 }], truncated: false });
    return new Response(path.endsWith('README.md') ? '# Service\n[Config](docs/config.md)' : 'Set CONFIG_FLAG=true.', { headers: { 'content-type': 'text/plain' } });
  }) as any));
  const result = await new ResearchSourceReader(AbortSignal.timeout(1000)).repository('https://github.com/source-fixture/pin', 'config');
  expect(result.sha).toBe(sha); expect(result.documents).toHaveLength(3);
  expect(result.documents[0].content).toContain('"fork":false');
  expect(result.documents[1].url).toContain(`/blob/${sha}/`);
  expect(result.documents[1].links[0].url).toBe(`https://github.com/source-fixture/pin/blob/${sha}/docs/config.md`);
  expect(requests.filter(url => url.includes('raw.githubusercontent.com')).every(url => url.includes(`/${sha}/`))).toBe(true);
  const count = requests.length;
  await expect(new ResearchSourceReader(AbortSignal.timeout(1000)).repository('https://github.com/source-fixture/pin', 'config', ['../../private'])).rejects.toThrow('repository_path_not_in_tree');
  expect(requests).toHaveLength(count);
});

test('one failed repository file does not discard independently fetched metadata and docs', async () => {
  const sha = 'd4'.repeat(20);
  restores.push(spyOn(researchTransport, 'fetch').mockImplementation((async (url: any) => {
    const path = new URL(url).pathname;
    if (path === '/repos/source-fixture/partial') return Response.json({ full_name: 'source-fixture/partial', default_branch: 'main', fork: false });
    if (path.endsWith('/commits/main')) return Response.json({ sha });
    if (path.includes('/git/trees/')) return Response.json({ tree: ['README.md', 'docs/config.md'].map(path => ({ path, type: 'blob', mode: '100644', size: 40 })), truncated: true });
    return path.endsWith('README.md') ? new Response('temporary failure', { status: 503 }) : new Response('Config supported.', { headers: { 'content-type': 'text/plain' } });
  }) as any));
  const result = await new ResearchSourceReader(AbortSignal.timeout(1000)).repository('https://github.com/source-fixture/partial', 'config');
  expect(result.treeTruncated).toBe(true);
  expect(result.documents).toHaveLength(2);
  expect(result.fileErrors).toEqual([{ path: 'README.md', error: 'repository_file_unavailable' }]);
});

test('source URLs reject credentials and repository parsing rejects foreign or malformed origins', () => {
  expect(publicResearchUrl('https://user:pass@example.com/private')).toBeNull();
  expect(publicResearchUrl('file:///etc/passwd')).toBeNull();
  expect(publicResearchUrl('https://example.com/docs?access_token=private')).toBeNull();
  expect(githubRepository('https://github.com/example/repo.git')).toEqual({ repo: 'example/repo' });
  expect(githubRepository('https://github.com/example/repo/blob/abc/docs/config.md')).toEqual({ repo: 'example/repo', ref: 'abc', path: 'docs/config.md' });
  expect(githubRepository('https://github.com.evil.example/example/repo')).toBeNull();
});

test('production transport rejects private destinations before any HTTP request', async () => {
  await expect(new ResearchSourceReader(AbortSignal.timeout(1000)).read('http://127.0.0.1/private')).rejects.toThrow('private_target');
});
