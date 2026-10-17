import { expect, test } from 'bun:test';
import { stripInternalAnnotations } from './output';

const annotation = '[Discord chronology: {"sentAt":"2026-10-15T16:04:00.253Z","replyToMessageId":"1560322302267363349"}]';

test('the reported image reply keeps its human text and removes internal chronology', () => {
    const answer = 'jadi beneran Miku wkwk, cuma dibikin bentuk buah pir 🍐 ini fumo bootleg paling absurd';
    expect(stripInternalAnnotations(`${answer}\n${annotation}`)).toBe(answer);
});

test('nested chronology, quotes, escaped brackets and multiple annotations are removed without swallowing prose', () => {
    const nested = '[Discord chronology: {"messages":[{"name":"quote \\\" ] [","sentAt":"now"}]}]';
    expect(stripInternalAnnotations(`iya\n${nested}\nlanjut\n${annotation}`)).toBe('iya\n\nlanjut');
    expect(stripInternalAnnotations(`WOI ${annotation} akhirnya 😭`)).toBe('WOI  akhirnya 😭');
});

test('annotations inside inline code or a standalone code fence leave no empty wrapper', () => {
    expect(stripInternalAnnotations(`jawabannya Miku\n\`\`\`json\n${annotation}\n\`\`\``)).toBe('jawabannya Miku');
    expect(stripInternalAnnotations(`Miku \`${annotation}\``)).toBe('Miku');
});

test('metadata-only and truncated annotations cannot become a Discord message', () => {
    expect(stripInternalAnnotations(annotation)).toBe('');
    expect(stripInternalAnnotations('oke\n[Discord chronology: {"messages":[')).toBe('oke');
    expect(stripInternalAnnotations('[Discord chronology: {"sentAt":"unfinished')).toBe('');
});

test('other reserved model notes and image annotations are never public speech', () => {
    expect(stripInternalAnnotations('iya\n[INTERNAL_NOTE: ini lanjutan obrolan]\n[image data: {"name":"a [1].png"}; pixels supplied]')).toBe('iya');
    expect(stripInternalAnnotations('iya\n[ discord   chronology : {"sentAt":"now"}]')).toBe('iya');
});

test('ordinary timestamps, JSON, brackets, Markdown and code stay byte-for-byte unchanged', () => {
    for (const answer of ['sentAt itu waktu pesan dikirim', '{"sentAt":"2026-10-15T16:04:00Z","replyToMessageId":"123"}',
        'array[0] = [1, 2];', '[Discord chronology] itu label', '[docs](https://example.com)',
        '```ts\nconst text = "[ordinary]";\n```', 'wkwk 😭\n\n  paragraf kedua']) {
        expect(stripInternalAnnotations(answer)).toBe(answer);
    }
});

test('cleaning is idempotent and has no state shared between calls', () => {
    const clean = stripInternalAnnotations(`Miku\n${annotation}`);
    expect(stripInternalAnnotations(clean)).toBe(clean);
    expect(stripInternalAnnotations(`yang kedua\n${annotation}`)).toBe('yang kedua');
});
