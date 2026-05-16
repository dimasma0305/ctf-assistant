import { OmitPartialGroupDMChannel, Message as DiscordMessage } from "discord.js";

// Hard limits to keep prompts from blowing up the context window.
const MAX_BYTES_PER_FILE = 64 * 1024;      // 64 KB per attachment
const MAX_TOTAL_BYTES = 192 * 1024;        // 192 KB across all attachments per turn
const MAX_FILES = 5;                       // never inline more than 5 files
const FETCH_TIMEOUT_MS = 8_000;

// Image attachments — we don't have vision yet, but we still surface a marker
// so the model knows the user attached one (and can ask the user to describe it).
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif']);

/**
 * Extensions we'll inline as text. Conservative — only obvious text/code.
 * Anything else (.exe, .zip, .pyc, …) is flagged but not downloaded.
 */
const TEXT_EXTENSIONS = new Set([
    // generic text
    'txt', 'md', 'log', 'csv', 'tsv', 'rst', 'env', 'ini', 'cfg', 'conf', 'toml',
    'yaml', 'yml', 'json', 'json5', 'jsonc', 'xml', 'html', 'htm', 'css', 'scss',
    // programming
    'py', 'pyw', 'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'rb', 'go', 'rs', 'java',
    'kt', 'kts', 'scala', 'c', 'h', 'cc', 'cpp', 'cxx', 'hpp', 'm', 'mm', 'cs',
    'fs', 'fsx', 'swift', 'php', 'pl', 'pm', 'sh', 'bash', 'zsh', 'fish', 'ps1',
    'bat', 'cmd', 'lua', 'r', 'jl', 'ex', 'exs', 'erl', 'hrl', 'clj', 'cljs',
    'el', 'lisp', 'scm', 'sql', 'graphql', 'gql', 'proto', 'thrift', 'asm',
    's', 'S', 'nasm',
    // CTF-relevant
    'sage', 'gp', 'magma', 'pwn', 'gdb', 'rop', 'ld', 'lds', 'map',
    // build / config
    'dockerfile', 'mk', 'makefile', 'cmake', 'gradle', 'pom', 'lock',
    'gitignore', 'gitattributes', 'editorconfig', 'prettierrc', 'eslintrc',
    // CTF challenge dumps
    'diff', 'patch', 'pem', 'pub', 'crt', 'key', 'b64', 'hex', 'flag'
]);

function getExtension(filename: string): string {
    const idx = filename.lastIndexOf('.');
    if (idx < 0) return '';
    return filename.slice(idx + 1).toLowerCase();
}

function looksLikeText(contentType: string | null | undefined, filename: string): boolean {
    const ext = getExtension(filename);
    if (TEXT_EXTENSIONS.has(ext)) return true;
    if (!contentType) return false;
    return contentType.startsWith('text/')
        || contentType.includes('json')
        || contentType.includes('xml')
        || contentType.includes('javascript')
        || contentType.includes('x-yaml')
        || contentType.includes('x-toml');
}

function isImage(contentType: string | null | undefined, filename: string): boolean {
    if (contentType?.startsWith('image/')) return true;
    return IMAGE_EXTENSIONS.has(getExtension(filename));
}

/**
 * Quick utf-8 sanity check — refuse to inline a "text" file that's actually
 * binary (e.g. someone renamed a PE to .txt). Looks for NUL bytes or a
 * suspiciously high fraction of control chars.
 */
function looksLikePrintableText(buf: Buffer): boolean {
    if (buf.includes(0)) return false;
    if (buf.length === 0) return true;
    let printable = 0;
    const sampleLen = Math.min(buf.length, 4096);
    for (let i = 0; i < sampleLen; i++) {
        const b = buf[i];
        if (b === 9 || b === 10 || b === 13 || (b >= 32 && b < 127) || b >= 128) printable++;
    }
    return printable / sampleLen > 0.85;
}

async function fetchWithTimeout(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

export interface AttachmentSummary {
    /** Markdown block describing each attachment for the prompt. */
    promptBlock: string;
    /** Whether anything was successfully inlined or noted. */
    hasContent: boolean;
}

/**
 * Build a prompt-ready block describing the message's attachments.
 * Text/code under MAX_BYTES_PER_FILE is inlined as a fenced code block;
 * images and oversized/binary files are noted with metadata only.
 */
export async function buildAttachmentBlock(
    message: OmitPartialGroupDMChannel<DiscordMessage<boolean>>
): Promise<AttachmentSummary> {
    const attachments = Array.from(message.attachments.values());
    if (attachments.length === 0) return { promptBlock: '', hasContent: false };

    const considered = attachments.slice(0, MAX_FILES);
    const parts: string[] = [];
    let bytesUsed = 0;

    for (const att of considered) {
        const name = att.name ?? 'unnamed';
        const ext = getExtension(name);
        const size = att.size ?? 0;
        const contentType = att.contentType ?? '';

        if (isImage(contentType, name)) {
            parts.push(`📎 **${name}** (image, ${formatBytes(size)}) — *aku belum bisa lihat gambar langsung, minta user deskripsiin ya kalo penting*`);
            continue;
        }

        if (!looksLikeText(contentType, name)) {
            parts.push(`📎 **${name}** (${contentType || ext || 'unknown'}, ${formatBytes(size)}) — *binary/unsupported, ga aku baca*`);
            continue;
        }

        if (size > MAX_BYTES_PER_FILE) {
            parts.push(`📎 **${name}** (${formatBytes(size)}) — *kegedean, ga aku baca (limit ${formatBytes(MAX_BYTES_PER_FILE)})*`);
            continue;
        }

        if (bytesUsed + size > MAX_TOTAL_BYTES) {
            parts.push(`📎 **${name}** — *total attachment budget kepenuhan, di-skip*`);
            continue;
        }

        try {
            const res = await fetchWithTimeout(att.url);
            if (!res.ok) {
                parts.push(`📎 **${name}** — *gagal di-download (HTTP ${res.status})*`);
                continue;
            }
            const buf = Buffer.from(await res.arrayBuffer());
            if (buf.length > MAX_BYTES_PER_FILE) {
                parts.push(`📎 **${name}** (${formatBytes(buf.length)}) — *kegedean setelah download, skip*`);
                continue;
            }
            if (!looksLikePrintableText(buf)) {
                parts.push(`📎 **${name}** — *kelihatannya binary, ga aku tampilin*`);
                continue;
            }
            const text = buf.toString('utf-8');
            bytesUsed += buf.length;
            const fence = pickFence(text);
            parts.push(`📎 **${name}** (${formatBytes(buf.length)})\n${fence}${langHint(ext)}\n${text}\n${fence}`);
        } catch (error) {
            parts.push(`📎 **${name}** — *error pas baca file: ${(error as Error).message}*`);
        }
    }

    if (attachments.length > MAX_FILES) {
        parts.push(`*…dan ${attachments.length - MAX_FILES} attachment lain (di-skip biar prompt ga kepenuhan)*`);
    }

    if (parts.length === 0) return { promptBlock: '', hasContent: false };

    return {
        promptBlock: `\n\n**[Attachments]**\n${parts.join('\n\n')}`,
        hasContent: true
    };
}

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function langHint(ext: string): string {
    // Mapping a few common ones to discord-friendly fence labels.
    const map: Record<string, string> = {
        py: 'python', js: 'javascript', mjs: 'javascript', cjs: 'javascript',
        ts: 'typescript', tsx: 'tsx', jsx: 'jsx',
        rb: 'ruby', rs: 'rust', go: 'go', java: 'java', kt: 'kotlin',
        c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp',
        cs: 'csharp', php: 'php', pl: 'perl', sh: 'bash', bash: 'bash',
        zsh: 'bash', fish: 'fish', ps1: 'powershell',
        sql: 'sql', json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'toml',
        xml: 'xml', html: 'html', htm: 'html', css: 'css', md: 'markdown',
        dockerfile: 'dockerfile', diff: 'diff', patch: 'diff',
        asm: 'asm', s: 'asm', lua: 'lua', r: 'r', swift: 'swift',
    };
    return map[ext] || '';
}

/**
 * Pick a code fence that doesn't conflict with backticks already in the file.
 */
function pickFence(text: string): string {
    let fence = '```';
    while (text.includes(fence)) fence += '`';
    return fence;
}
