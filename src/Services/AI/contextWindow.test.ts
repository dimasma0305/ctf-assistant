import { expect, test } from 'bun:test';
import { Collection } from 'discord.js';
import { getChannelContext } from './context';
import { updateChannelCache } from './cache';

process.env.NODB = 'true';

test('a late summon retains the opening and corrections of one active multiparty topic', async () => {
  const channelId = 'context-window-agung-case';
  const started = Date.parse('2026-10-19T10:06:00Z');
  const lines = [
    ['W', 'TNI/POLRI belakangan ini kayaknya lagi coba gali skill Cyber, wonder for what reasons'],
    ['KudaLiar', 'pas Waskita kemaren disuruh ngisi form pendataan'],
    ['roner', 'panitianya asal ada nama hack hacknya'],
    ['Aryma', 'iya pas setelah rtr2 kemaren'],
    ['Dimas', 'codepolitan yang diajak, seharusnya lebih ke buat program'],
    ['Aryma', 'temennya bang dimas ada yang udah jadi letda'],
    ['Dimas', 'siapa tuh? username discordnya?'],
    ['Aryma', 'bang agung'],
    ['Aryma', 'udah ganti username, opsec mode; menang GEMASTIK juara 2 atau 3 tahun 2022 atau 2023, lupa'],
    ['Dimas', 'aku juga dah lupa sih'],
    ['Aryma', 'nama fullnya aku tahu, mau aku DM?'],
    ['Dimas', 'boleh'],
  ];
  const history = Array.from({ length: 27 }, (_, index) => {
    const [name, content] = lines[index] || ['KudaLiar', `obrolan singkat ${index}`];
    return { id: String(800000000000000000n + BigInt(index)), content, author: { id: name, username: name, tag: name },
      member: { displayName: name, nickname: null }, channelId, createdTimestamp: started + index * 18_000,
      system: false, type: 0, attachments: new Collection(), embeds: [], mentions: { users: new Collection(), members: new Collection() } };
  });
  const channel = { id: channelId, messages: { fetch: async () => new Collection(history.map(item => [item.id, item])) } };
  for (const entry of history) await updateChannelCache({ ...entry, channel } as Parameters<typeof updateChannelCache>[0]);
  const current = { id: '800000000000000099', content: 'search tentang agung ini @Hackerika', channel, channelId,
    createdTimestamp: started + 8 * 60_000 };
  const context = await getChannelContext(current as Parameters<typeof getChannelContext>[0], 'BEGIN', 'END');
  expect(context).toContain('TNI/POLRI belakangan');
  expect(context).toContain('bang agung');
  expect(context).toContain('GEMASTIK juara 2 atau 3');
  expect(context).toContain('nama fullnya aku tahu, mau aku DM?');
  expect(context.length).toBeLessThan(15_000);
});

test('a 20-message legacy cache backfills only the current channel before rendering', async () => {
  const channelId = 'context-window-legacy-cache';
  const started = Date.parse('2026-10-19T10:06:00Z');
  const history = Array.from({ length: 27 }, (_, index) => ({ id: String(810000000000000000n + BigInt(index)),
    content: index === 0 ? 'TNI/POLRI cyber discussion opened here' : `same topic message ${index}`,
    author: { id: '111111111111111111', username: 'Dimas', tag: 'Dimas' }, member: null, channelId,
    createdTimestamp: started + index * 18_000, system: false, type: 0,
    attachments: new Collection(), embeds: [], mentions: { users: new Collection(), members: new Collection() } }));
  const foreign = { ...history[0], id: 'foreign-mention', channelId: 'another-channel', content: 'PRIVATE-FOREIGN-CONTEXT' };
  let fetches = 0;
  const channel = { id: channelId, messages: { fetch: async () => { fetches++; return new Collection([...history, foreign].map(item => [item.id, item])); } } };
  for (const entry of history.slice(-20)) await updateChannelCache({ ...entry, channel } as Parameters<typeof updateChannelCache>[0]);
  const current = { id: '810000000000000099', content: 'search tentang agung ini', channel, channelId,
    createdTimestamp: started + 8 * 60_000 };
  const context = await getChannelContext(current as Parameters<typeof getChannelContext>[0], 'BEGIN', 'END');
  expect(fetches).toBe(1);
  expect(context).toContain('TNI/POLRI cyber discussion opened here');
  expect(context).not.toContain('PRIVATE-FOREIGN-CONTEXT');
});
