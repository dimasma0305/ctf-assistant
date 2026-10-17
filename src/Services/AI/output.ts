// Reserved annotations are context for the model, never Discord message text.
// Match their explicit wrappers rather than stripping ordinary JSON, IDs,
// timestamps, links, code or square brackets from legitimate answers.
const INTERNAL_BLOCK = /\[\s*(?:Discord\s+chronology|image\s+data|INTERNAL_NOTE)\s*:/gi;

export function stripInternalAnnotations(text: string): string {
    const pattern = new RegExp(INTERNAL_BLOCK);
    const chunks: string[] = [];
    let cursor = 0, match: RegExpExecArray | null;
    while ((match = pattern.exec(text))) {
        let depth = 1, quoted = false, escaped = false, end = text.length;
        for (let index = pattern.lastIndex; index < text.length; index++) {
            const char = text[index];
            if (quoted) {
                if (escaped) escaped = false;
                else if (char === '\\') escaped = true;
                else if (char === '"') quoted = false;
            } else if (char === '"') quoted = true;
            else if (char === '[') depth++;
            else if (char === ']' && --depth === 0) { end = index + 1; break; }
        }
        let start = match.index;
        // Remove a single inline-code wrapper together with its annotation.
        if (text[start - 1] === '`' && text[end] === '`' && text[start - 2] !== '`' && text[end + 1] !== '`') { start--; end++; }
        chunks.push(text.slice(cursor, start)); cursor = end; pattern.lastIndex = end;
    }
    if (!chunks.length) return text;
    chunks.push(text.slice(cursor));
    return chunks.join('')
        .replace(/(^|\n)[ \t]*```[\w-]*[ \t]*\r?\n\s*```[ \t]*(?=\n|$)/g, '$1')
        .replace(/[ \t]+\r?\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
