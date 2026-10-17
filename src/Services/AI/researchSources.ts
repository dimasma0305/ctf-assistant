import * as cheerio from 'cheerio';
import { safeFetch, readResponseTextWithLimit } from '../../utils/urlGuard';

export interface ResearchDocument {
  url: string; title: string; content: string;
  kind: 'page' | 'repository-metadata' | 'repository-file' | 'search';
  links: { url: string; title: string }[];
  truncated?: boolean;
}
export interface RepositorySnapshot {
  repo: string; sha: string; documents: ResearchDocument[]; paths: string[]; treeTruncated: boolean;
  fileErrors: { path: string; error: string }[];
}
// Dependency boundary for isolated transport tests. Production always uses the
// existing DNS-pinned public-URL guard, including every redirect hop.
export const researchTransport = { fetch: safeFetch };
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_FILE_BYTES = 512 * 1024;
const snapshotCache = new Map<string, { at: number; data: Promise<any> }>();
const words = (text: string) => [...new Set(text.toLowerCase().match(/[a-z][a-z0-9_-]{2,}/g) || [])]
  .filter(word => !/^(the|and|for|from|with|this|that|what|how|are|repo|repository|github|com|https|yang|dan|dari|ini|itu|apa|cara|cek|pakai|tolong|bisa)$/.test(word)).slice(0, 35);

export function publicResearchUrl(value: unknown, base?: string): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value, base);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    if ([...url.searchParams.keys()].some(key => /token|api.?key|secret|password|signature|^auth$|^authorization$/i.test(key))) return null;
    url.hash = '';
    return url.href;
  } catch { return null; }
}

export function githubRepository(value: string): { repo: string; ref?: string; path?: string } | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.username || url.password) return null;
    const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    const owner = parts[0], name = parts[1]?.replace(/\.git$/, '');
    if (!owner || !name || ![owner, name].every(part => /^[\w.-]{1,100}$/.test(part) && !['.', '..'].includes(part))) return null;
    if (parts.length > 2 && !['tree', 'blob'].includes(parts[2])) return null;
    return { repo: `${owner}/${name}`, ...(parts[3] ? { ref: parts[3] } : {}),
      ...(parts[2] === 'blob' && parts.length > 4 ? { path: parts.slice(4).join('/') } : {}) };
  } catch { return null; }
}

/** Preserve whole lines and their locations; focus windows can reach deep pages. */
export function sourceExcerpt(text: string, focus = '', maxChars = 12_000): { content: string; truncated: boolean } {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const terms = words(focus);
  const scored = lines.map((line, index) => ({ index, score: terms.reduce((n, term) => n + (line.toLowerCase().includes(term) ? 1 : 0), 0) }))
    .filter(row => row.score > 0).sort((a, b) => b.score - a.score || a.index - b.index);
  const full = lines.map((line, i) => `${i + 1}: ${line}`).join('\n');
  if (full.length <= maxChars) return { content: full, truncated: false };
  const selected = new Set<number>();
  // Include an identity preamble and several relevant sections, not just a prefix.
  for (let i = 0; i < Math.min(8, lines.length); i++) selected.add(i);
  for (const row of scored.slice(0, 8)) for (let i = Math.max(0, row.index - 3); i <= Math.min(lines.length - 1, row.index + 8); i++) selected.add(i);
  if (!scored.length) for (let i = 0; i < lines.length && i < 90; i++) selected.add(i);
  let content = '', previous = -1;
  for (const index of [...selected].sort((a, b) => a - b)) {
    const line = `${index > previous + 1 ? '[… omitted lines …]\n' : ''}${index + 1}: ${lines[index]}\n`;
    // A huge generated line cannot consume the entire excerpt or hide matches.
    const clipped = line.length > 1800 ? line.slice(0, 1800) + ' [… line truncated …]\n' : line;
    if (content.length + clipped.length > maxChars) continue;
    content += clipped; previous = index;
  }
  return { content: content.trim(), truncated: true };
}

function parsePage(raw: string, url: string, html: boolean): { title: string; text: string; links: ResearchDocument['links'] } {
  const links: ResearchDocument['links'] = [];
  const addLink = (href: string | undefined, title: string) => {
    const target = publicResearchUrl(href, url);
    if (target && !links.some(link => link.url === target) && links.length < 60) links.push({ url: target, title: title.slice(0, 160) });
  };
  if (!html) {
    for (const match of raw.matchAll(/\[([^\]]{1,180})\]\(([^\s)]+)\)/g)) addLink(match[2], match[1]);
    return { title: url.split('/').at(-1) || url, text: raw, links };
  }
  const $ = cheerio.load(raw);
  const title = $('title').first().text().trim() || $('h1').first().text().trim() || new URL(url).hostname;
  $('script,style,noscript,svg,nav,header,footer,form,button').remove();
  const main = $('main').first().length ? $('main').first() : $('article').first().length ? $('article').first() : $('body');
  main.find('a[href]').each((_i, element) => addLink($(element).attr('href'), $(element).text().trim()));
  main.find('br').replaceWith('\n');
  main.find('p,div,li,h1,h2,h3,h4,pre,table,tr,section').each((_i, element) => { $(element).append('\n'); });
  return { title: title.slice(0, 200), text: main.text().replace(/[ \t]+/g, ' ').replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').trim(), links };
}

export class ResearchSourceReader {
  private textCache = new Map<string, Promise<{ raw: string; url: string; type: string }>>();
  constructor(private readonly signal: AbortSignal) {}

  private async text(url: string, maxBytes = MAX_BYTES) {
    const existing = this.textCache.get(url);
    if (existing) return existing;
    if (this.textCache.size >= 30) throw new Error('source_request_budget');
    const pending = (async () => {
      const response = await researchTransport.fetch(url, { method: 'GET',
        signal: AbortSignal.any([this.signal, AbortSignal.timeout(12_000)]),
        headers: { 'User-Agent': 'Hackerika-Research/1', Accept: 'application/json,text/html,text/plain;q=0.9', 'X-GitHub-Api-Version': '2022-11-28' } });
      if (!response.ok) { await response.body?.cancel(); throw new Error(`source_http_${response.status}`); }
      const type = response.headers.get('content-type') || '';
      if (type && !/text|json|xml|html/i.test(type)) { await response.body?.cancel(); throw new Error('source_non_text'); }
      return { raw: await readResponseTextWithLimit(response, maxBytes), url: response.url || url, type };
    })();
    this.textCache.set(url, pending);
    return pending;
  }

  async read(urlValue: string, focus = ''): Promise<ResearchDocument> {
    const url = publicResearchUrl(urlValue);
    if (!url) throw new Error('invalid_source_url');
    const github = githubRepository(url);
    if (github?.path) {
      const snapshot = await this.repository(url, focus, [github.path]);
      const document = snapshot.documents.find(doc => doc.kind === 'repository-file');
      if (!document) throw new Error('source_file_missing');
      return document;
    }
    const page = await this.text(url);
    const parsed = parsePage(page.raw, page.url, /html/i.test(page.type) || /^\s*<(?:!doctype|html|main)/i.test(page.raw));
    const excerpt = sourceExcerpt(parsed.text, focus);
    return { url: page.url, title: parsed.title, kind: 'page', ...excerpt, links: parsed.links };
  }

  private async snapshot(repo: string, ref?: string): Promise<any> {
    const key = `${repo.toLowerCase()}:${ref || 'HEAD'}`;
    let cached = snapshotCache.get(key);
    if (cached && Date.now() - cached.at < 120_000) return cached.data;
    if (snapshotCache.size >= 32) snapshotCache.delete(snapshotCache.keys().next().value!);
    const data = (async () => {
      const metadata = JSON.parse((await this.text(`https://api.github.com/repos/${repo}`)).raw);
      if (!metadata.default_branch || metadata.full_name?.toLowerCase() !== repo.toLowerCase()) throw new Error('repository_identity_mismatch');
      const commit = JSON.parse((await this.text(`https://api.github.com/repos/${repo}/commits/${encodeURIComponent(ref || metadata.default_branch)}`)).raw);
      if (!/^[a-f0-9]{40}$/i.test(commit.sha)) throw new Error('invalid_repository_revision');
      const tree = JSON.parse((await this.text(`https://api.github.com/repos/${repo}/git/trees/${commit.sha}?recursive=1`)).raw);
      if (!Array.isArray(tree.tree)) throw new Error('invalid_repository_tree');
      return { metadata, sha: commit.sha, tree };
    })();
    snapshotCache.set(key, { at: Date.now(), data });
    data.catch(() => { if (snapshotCache.get(key)?.data === data) snapshotCache.delete(key); });
    return data;
  }

  async repository(url: string, focus = '', requestedPaths?: string[]): Promise<RepositorySnapshot> {
    const parsed = githubRepository(url);
    if (!parsed) throw new Error('invalid_repository_url');
    const { repo, ref } = parsed;
    const { metadata, sha, tree } = await this.snapshot(repo, ref);
    const terms = words(focus).filter(term => !repo.toLowerCase().split('/').includes(term));
    const candidates = tree.tree.filter((entry: any) => entry.type === 'blob' && ['100644', '100755'].includes(entry.mode)
      && (entry.size === undefined || entry.size <= MAX_FILE_BYTES) && typeof entry.path === 'string'
      && !entry.path.split('/').some((part: string) => !part || part === '..' || part === '.')
      && (/\.(mdx?|txt|rs|tsx?|jsx?|go|mod|py|toml|ya?ml|json|example|sh)$/i.test(entry.path) || /(?:^|\/)Dockerfile$/i.test(entry.path)))
      .map((entry: any) => ({ path: entry.path as string, score: terms.reduce((n, term) => n + (entry.path.toLowerCase().includes(term) ? 6 : 0), 0)
        + (/^docs\//i.test(entry.path) ? 2 : 0)
        - (/(?:^|\/)(?:\.agents|\.claude|\.codex|agents)(?:\/|$)|(?:^|\/)(?:AGENTS|CLAUDE|SKILL)\.md$/i.test(entry.path) ? 100 : 0)
        + (/^(Cargo\.toml|go\.mod|package\.json)$/i.test(entry.path) && /language|stack|rust|go\b|fork|identity/i.test(focus) ? 4 : 0) }))
      .sort((a: any, b: any) => b.score - a.score || a.path.localeCompare(b.path));
    const available = new Set<string>(candidates.map((entry: any) => entry.path));
    const readme = [...available].find(path => /^readme\.md$/i.test(path));
    const wanted = requestedPaths?.length ? requestedPaths.slice(0, 3)
      : [...new Set([...(readme ? [readme] : []), ...candidates.filter((entry: any) => entry.path !== readme).slice(0, 2).map((entry: any) => entry.path)])];
    if (wanted.some(path => !available.has(path))) throw new Error('repository_path_not_in_tree');
    const metadataUrl = `https://api.github.com/repos/${repo}`;
    const identity: ResearchDocument = { url: metadataUrl, title: `${repo} repository metadata`, kind: 'repository-metadata',
      content: JSON.stringify({ full_name: metadata.full_name, description: metadata.description, language: metadata.language,
        fork: metadata.fork, parent: metadata.parent?.full_name || null, default_branch: metadata.default_branch, inspected_commit: sha }), links: [] };
    const results = await Promise.allSettled(wanted.map(async path => {
      const encodedPath = path.split('/').map(encodeURIComponent).join('/');
      const rawUrl = `https://raw.githubusercontent.com/${repo}/${sha}/${encodedPath}`;
      const file = await this.text(rawUrl, MAX_FILE_BYTES);
      const documentUrl = `https://github.com/${repo}/blob/${sha}/${encodedPath}`;
      const rawBase = `https://github.com/${repo}/blob/${sha}/${encodedPath}`;
      const page = parsePage(file.raw, rawBase, false);
      // Markdown links should remain on the pinned commit when following a doc.
      return { url: documentUrl, title: `${repo}: ${path}`, kind: 'repository-file' as const,
        ...sourceExcerpt(page.text, focus), links: page.links };
    }));
    const files = results.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
    const fileErrors = results.flatMap((result, index) => result.status === 'rejected'
      ? [{ path: wanted[index], error: 'repository_file_unavailable' }] : []);
    return { repo, sha, documents: [identity, ...files], paths: candidates.slice(0, 80).map((entry: any) => entry.path), treeTruncated: !!tree.truncated, fileErrors };
  }
}
