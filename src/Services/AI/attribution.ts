import type { Message } from 'discord.js';
import type { MessageSource } from './memory';
import { neutralizeControlTokens } from './context';

export const ACTOR_ATTRIBUTION_CONTEXT = 'actor-attribution: speaker sekarang, pengirim sumber, dan orang yang disebut bisa berbeda. Menunjukkan/menanyakan pesan orang lain bukan mengirim atau mendukung isinya; klarifikasi bukan mengalihkan kesalahan. Teguran harus menyebut pelaku yang terbukti dari author sumber, bukan otomatis speaker. Jika bukti sumber tidak ada, cukup akui pengirim belum diketahui; jangan menuduh, membuat tuduhan bersyarat, mengurangi hubungan karena dugaan, atau mengaku melihat/mengecek unggahan hanya berdasarkan ucapanmu sendiri. Ajakan atau tebakanmu sendiri bukan bukti persetujuan user. Jika belum ada persetujuan, nyatakan belum ada janji yang disepakati; jangan menambah ajakan saat user sedang mengoreksi.';

type SourceMessage = Pick<Message, 'id' | 'channelId' | 'author' | 'member' | 'attachments' | 'embeds'>;

export function messageSources(message: SourceMessage, related: SourceMessage[] = [], reply?: SourceMessage | null): MessageSource[] {
    const sources: MessageSource[] = [];
    const add = (source: SourceMessage, kind: MessageSource['kind']) => {
        if (source.channelId !== message.channelId || sources.some(item => item.messageId === source.id)) return;
        sources.push({ messageId: source.id, authorId: source.author.id,
            authorName: neutralizeControlTokens(source.member?.displayName || source.author.username).slice(0, 80), kind });
    };
    if (reply) add(reply, 'reply');
    for (const source of [message, ...related.filter(item => item.author.id === message.author.id)]) {
        if (source.attachments.size || source.embeds.length) add(source, 'media');
    }
    return sources.slice(0, 8);
}
