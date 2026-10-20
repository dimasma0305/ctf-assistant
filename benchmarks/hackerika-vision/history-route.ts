import { writeFile } from 'node:fs/promises';
import { buildHackerikaSystemPrompt } from '../../src/Services/AI/persona';
import { TOOL_DEFINITIONS } from '../../src/Services/AI/tools';
import { MODELS } from '../../src/Services/AI/models';
import { openai } from '../../src/utils/openai';

const out = process.argv[process.argv.indexOf('--out') + 1];
if (!out || !openai) throw Error('Use --out FILE with the configured production AI provider');
const botId = '1077393568647352320';
const cases = [
    { id: 'historical_charts', input: `<@${botId}> tolong validasi percakapan dan gambar-gambar di atas`, expectedTool: 'read_channel_images' },
    { id: 'historical_chart_detail', input: `<@${botId}> di grafik yang tadi, hari apa yang paling tinggi dan nilainya berapa?`, expectedTool: 'read_channel_images' },
    { id: 'text_only', input: `<@${botId}> rangkum pendapat Dimas dan !n4cttt soal pasar kerja tadi, dari teks chat aja`, expectedTool: null },
];
const context = `«ctx»\nuser=Dimas (663394727688798231)\nenv=guild=TCP1P channel=#general\n«chan»\n[Dimas <@663394727688798231>] message-id=156000000000000001 sent-at=2026-10-20T15:46:00.000Z freshgrads minggir [attach]\n[Dimas <@663394727688798231>] message-id=156000000000000002 sent-at=2026-10-20T15:47:00.000Z dilihat dari grafiknya kita perlu nunggu senior pensiun [attach]\n[Dimas <@663394727688798231>] message-id=156000000000000003 sent-at=2026-10-20T15:48:00.000Z prediksi kerja sudah kayak main crypto, semoga rebound [attach]\n[!n4cttt <@200000000000000001>] message-id=156000000000000004 sent-at=2026-10-20T15:55:00.000Z pengen ke blue team sih\n[Dimas <@663394727688798231>] message-id=156000000000000005 sent-at=2026-10-20T15:56:00.000Z coba jadi SOC AI phishing [attach]\n«/chan»\n«/ctx»`;
const rows = [];
for (const test of cases) {
    const messages: any[] = [{ role: 'system', content: buildHackerikaSystemPrompt(botId, '663394727688798231') },
        { role: 'user', content: `${context}\n\n[Dimas <@663394727688798231>] ${test.input}` }];
    const response = await openai.chat.completions.create({ model: MODELS.chat, thinking: { type: 'enabled' }, reasoning_effort: 'low',
        messages,
        tools: [...TOOL_DEFINITIONS], tool_choice: 'auto', parallel_tool_calls: false } as any,
    { signal: AbortSignal.timeout(60_000), maxRetries: 0 });
    const choice = response.choices[0]?.message;
    const actualTool = choice?.tool_calls?.[0]?.function?.name || null;
    let visualAnswer: string | undefined;
    if (test.id === 'historical_chart_detail' && actualTool === 'read_channel_images') {
        const bytes = await Bun.file('benchmarks/hackerika-vision/fixtures/scene-c.png').arrayBuffer();
        const answer = await openai.chat.completions.create({ model: MODELS.vision,
            messages: [...messages, { ...choice, reasoning_content: (choice as any)?.reasoning_content || '' },
                { role: 'tool', tool_call_id: choice!.tool_calls![0]!.id, content: JSON.stringify({ ok: true,
                    images: [{ sourceMessageId: '156000000000000002', authorId: '663394727688798231', name: 'chart.png' }],
                    note: 'Selected image supplied as pixels in the next model input.' }) },
                { role: 'user', content: [
                    { type: 'text', text: '[INTERNAL_TOOL_IMAGE_OBSERVATION: Earlier upload from the same channel, not a new user message.] [image data: sourceMessageId=156000000000000002 authorId=663394727688798231]' },
                    { type: 'image_url', image_url: { url: `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`, detail: 'high' } },
                ] }], tool_choice: 'none' } as any, { signal: AbortSignal.timeout(60_000), maxRetries: 0 });
        visualAnswer = answer.choices[0]?.message?.content?.trim();
    }
    const row = { id: test.id, expectedTool: test.expectedTool, actualTool,
        pass: test.expectedTool === actualTool && (test.id !== 'historical_chart_detail' || !!visualAnswer && /rabu/i.test(visualAnswer) && /\b19\b/.test(visualAnswer)),
        text: choice?.content || '', ...(visualAnswer ? { visualAnswer } : {}) };
    rows.push(row); console.log(JSON.stringify(row));
}
await writeFile(out, JSON.stringify({ model: MODELS.chat, synthetic: true, noDiscordActions: true, rows }, null, 2) + '\n');
if (rows.some(row => !row.pass)) process.exitCode = 1;
