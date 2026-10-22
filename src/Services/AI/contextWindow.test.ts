import { expect, test } from 'bun:test';
import { Collection } from 'discord.js';
import { getChannelContext, getReplyContext } from './context';
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

test('a short confirmation after an interjection preserves the current speaker’s own antecedent', async () => {
  const channelId = 'context-window-interleaved-confirmation';
  const started = Date.parse('2026-10-21T10:50:00Z');
  const dimas = '663394727688798231';
  const w = '212606900854980609';
  const entries = [
    [dimas, 'tinggal nunggu, ada apa engga data breach lagi dari website pemerintah indo'],
    [dimas, 'klo misal ada berarti CVSS nya bisa 10'],
    [dimas, 'klo engga ada berarti mungkin 9.2'],
    [w, '2hu wiki?'],
    [w, 'yg mana itu'],
  ] as const;
  const channel = { id: channelId, messages: { fetch: async () => new Collection() } };
  for (const [index, [authorId, content]] of entries.entries()) {
    await updateChannelCache({ id: String(820000000000000000n + BigInt(index)), content,
      author: { id: authorId, username: authorId, tag: authorId }, member: null,
      channel, channelId, createdTimestamp: started + index * 10_000, system: false, type: 0,
      attachments: new Collection(), embeds: [], mentions: { users: new Collection(), members: new Collection() },
    } as Parameters<typeof updateChannelCache>[0]);
  }
  const current = { id: '820000000000000099', content: 'betul gak <@1077393568647352320>?',
    author: { id: dimas }, channel, channelId, createdTimestamp: started + 35_000 };
  const context = await getChannelContext(current as Parameters<typeof getChannelContext>[0], 'BEGIN', 'END');
  const anchor = context.split('same-speaker-earlier')[1];
  expect(anchor).toContain('CVSS nya bisa 10');
  expect(anchor).toContain('mungkin 9.2');
  expect(anchor).not.toContain('2hu wiki');
  expect(context).toContain('2hu wiki?');
  expect(context).not.toContain('yg mana itu');

  const replyMessage = { ...current, reference: { messageId: '820000000000000003' } } as Parameters<typeof getChannelContext>[0];
  const explicitReply = await getChannelContext(replyMessage, 'BEGIN', 'END');
  expect(explicitReply).not.toContain('same-speaker-earlier');
});

test('a bot answer alone does not trigger an unrelated same-speaker anchor', async () => {
  const channelId = 'context-window-bot-reply';
  const started = Date.parse('2026-10-21T10:50:00Z');
  const callerId = '663394727688798231';
  const botId = '1077393568647352320';
  const channel = { id: channelId, messages: { fetch: async () => new Collection() } };
  for (const [index, [authorId, content]] of ([
    [callerId, 'ini apa?'], [botId, 'ini challenge CTF'],
  ] as const).entries()) {
    await updateChannelCache({ id: String(830000000000000000n + BigInt(index)), content,
      author: { id: authorId, username: authorId, tag: authorId }, member: null,
      channel, channelId, createdTimestamp: started + index * 10_000, system: false, type: 0,
      attachments: new Collection(), embeds: [], mentions: { users: new Collection(), members: new Collection() },
    } as Parameters<typeof updateChannelCache>[0]);
  }
  const current = { id: '830000000000000099', content: 'betul gak?', author: { id: callerId },
    client: { user: { id: botId } }, channel, channelId, createdTimestamp: started + 20_000 };
  const context = await getChannelContext(current as Parameters<typeof getChannelContext>[0], 'BEGIN', 'END');
  expect(context).toContain('ini challenge CTF');
  expect(context).not.toContain('same-speaker-earlier');
});

test('a short follow-up keeps two other speakers’ latest statements attached to their authors', async () => {
  const channelId = 'context-window-max-kuda';
  const started = Date.parse('2026-10-22T14:22:00Z');
  const dimas = '663394727688798231', max = '765094257228120074';
  const kuda = '604688514772107274', bot = '1077393568647352320';
  const channel = { id: channelId, messages: { fetch: async () => new Collection() } };
  const entries = [
    [dimas, 'Dimas', `<@${bot}> deepsearch nama asli <@${max}>`],
    [kuda, 'KudaLiar', 'Stop doksing gweh'],
    [bot, 'Hackerika', 'Aku berhenti cari identitasmu.'],
    [max, 'Max Si Rubah Komputer', 'Coba search lewat dorking google di site site .ac.id rika'],
  ] as const;
  for (const [index, [authorId, displayName, content]] of entries.entries()) {
    await updateChannelCache({ id: String(840000000000000000n + BigInt(index)), content,
      author: { id: authorId, username: displayName, tag: displayName }, member: { displayName, nickname: null },
      channel, channelId, createdTimestamp: started + index * 10_000, system: false, type: 0,
      attachments: new Collection(), embeds: [], mentions: { users: new Collection(), members: new Collection() },
    } as Parameters<typeof updateChannelCache>[0]);
  }
  const current = { id: '840000000000000099', content: `<@${bot}> ini si max comment`,
    author: { id: dimas }, client: { user: { id: bot } }, channel, channelId,
    createdTimestamp: started + 40_000 };
  const context = await getChannelContext(current as Parameters<typeof getChannelContext>[0], 'BEGIN', 'END');
  const ledger = context.split('latest-per-speaker')[1];
  expect(ledger).toContain(`[KudaLiar <@${kuda}>]`);
  expect(ledger).toContain('Stop doksing gweh');
  expect(ledger).toContain(`[Max Si Rubah Komputer <@${max}>]`);
  expect(ledger).toContain('Coba search lewat dorking google');
  expect(ledger).not.toContain('Aku berhenti cari identitasmu');
});

test('a delivered bot image stays visible as an attachment in later context', async () => {
  const channelId = 'context-window-generated-image';
  const botId = '1077393568647352320';
  const sentAt = Date.parse('2026-10-22T23:18:00Z');
  const image = { name: 'kudaliar-liar.png', contentType: 'image/png', size: 34_000,
    url: 'https://cdn.discordapp.com/attachments/private-token/kudaliar-liar.png' };
  const botMessage = { id: '850000000000000001', content: 'Jadi! Unduh gambarnya: kudaliar-liar.png.',
    author: { id: botId, username: 'Hackerika', tag: 'Hackerika', bot: true },
    member: null, channelId, createdTimestamp: sentAt, system: false, type: 0,
    attachments: new Collection([['image', image]]), embeds: [],
    mentions: { users: new Collection(), members: new Collection() } };
  const channel = { id: channelId, messages: { fetch: async () => new Collection() } };
  await updateChannelCache({ ...botMessage, channel } as Parameters<typeof updateChannelCache>[0]);
  const followup = { id: '850000000000000002', content: 'Wtf was that',
    author: { id: '604688514772107274' }, client: { user: { id: botId } },
    channel, channelId, createdTimestamp: sentAt + 120_000 };
  let confirmed = false;
  const context = await getChannelContext(followup as Parameters<typeof getChannelContext>[0], 'BEGIN', 'END',
    undefined, () => { confirmed = true; });
  expect(confirmed).toBe(true);
  expect(context).toContain('kudaliar-liar.png');
  expect(context).toContain('attachments=[{"name":"kudaliar-liar.png","contentType":"image/png"}]');
  expect(context).toContain('confirmed-own-file-delivery');
  expect(context).not.toContain('private-token');

  const reply = await getReplyContext({ ...followup, reference: { messageId: botMessage.id } } as Parameters<typeof getReplyContext>[0],
    'REPLY', 'END', botMessage as Parameters<typeof getReplyContext>[3]);
  expect(reply).toContain('attachments=[{"name":"kudaliar-liar.png","contentType":"image/png"}]');
  expect(reply).not.toContain('private-token');

  const fetchedChannel = { id: `${channelId}-fetch`, messages: { fetch: async () => new Collection([['bot', {
    ...botMessage, channelId: `${channelId}-fetch`,
  }]]) } };
  const fetchedContext = await getChannelContext({ ...followup, channel: fetchedChannel } as Parameters<typeof getChannelContext>[0],
    'BEGIN', 'END');
  expect(fetchedContext).toContain('attachments=[{"name":"kudaliar-liar.png","contentType":"image/png"}]');
  expect(fetchedContext).toContain('confirmed-own-file-delivery');

  const later = { ...followup, id: '850000000000000003', content: 'lah tadi bisa',
    createdTimestamp: sentAt + 23 * 60_000 };
  let recentDelivery = false;
  const laterContext = await getChannelContext(later as Parameters<typeof getChannelContext>[0], 'BEGIN', 'END',
    undefined, () => { recentDelivery = true; });
  expect(laterContext).toContain('confirmed-own-file-delivery');
  expect(laterContext).toContain('kudaliar-liar.png');
  expect(recentDelivery).toBe(false); // Old file evidence does not imply fresh pixels.
});
