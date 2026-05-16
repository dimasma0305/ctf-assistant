import { Message as DiscordMessage, OmitPartialGroupDMChannel } from "discord.js";

// Per-channel cooldown — at most one ambient reaction per channel per
// REACT_COOLDOWN_MS. Keeps her from spamming.
const REACT_COOLDOWN_MS = 60_000;
const lastReactionAt = new Map<string, number>();

interface ReactionRule {
    // Matches one of these substrings (case-insensitive) → eligible
    match: RegExp;
    // Pick from these emojis when triggered
    emojis: string[];
    // Probability 0-1 of actually reacting when matched
    probability: number;
}

const RULES: ReactionRule[] = [
    // Wins / solves / breakthroughs
    { match: /\b(solve|solved|nemu|first blood|firstblood|got\s*it|got flag|dapet flag|got the flag|berhasil|cracked|pwn(?:ed)?)\b/i, emojis: ['🔥', '🎉', '👏', '💪'], probability: 0.5 },
    // CTF flags being shared
    { match: /flag\{|CTF\{|TCP1P\{|fakeflag\{/i, emojis: ['🚩', '🎯'], probability: 0.7 },
    // Funny / laughter
    { match: /\b(wkwk(?:wk)?|ngakak|lol|lmao|rofl|hehe|xixi)\b/i, emojis: ['😂', '🤣', '💀'], probability: 0.08 },
    // Frustration / failure
    { match: /\b(stuck|nyangkut|buntu|fail|gagal|capek|cape|ngga bisa|gabisa|nyerah|menyerah)\b/i, emojis: ['🥺', '😔', '🫂'], probability: 0.15 },
    // Late-night chat
    { match: /\b(ngantuk|udah malem|tidur|insomnia|gabisa tidur)\b/i, emojis: ['🥱', '😴', '🌙'], probability: 0.2 },
    // Excitement
    { match: /\b(seru|keren|mantap|mantul|sick|insane|gokil|wagelaseh|wajedih)\b/i, emojis: ['🔥', '✨', '🤩'], probability: 0.1 },
    // Greetings (welcome-style)
    { match: /\b(welcome|selamat datang|halo semua|hi everyone)\b/i, emojis: ['👋', '🎀'], probability: 0.3 },
    // Food
    { match: /\b(makan|laper|lapar|indomie|mie ayam|nasi padang|kopi|coffee)\b/i, emojis: ['🍜', '☕', '🤤'], probability: 0.1 },
    // Mentioning Hackerika directly
    { match: /\bhackerika\b/i, emojis: ['🎀', '✨', '👀'], probability: 0.05 },
];

/**
 * Try to react to an incoming channel message with an ambient emoji. Returns
 * `true` if a reaction was sent. Skipped silently if:
 *   - Author is the bot itself or any bot
 *   - Channel is on cooldown
 *   - No rule matches
 *   - Random probability gate fails
 *
 * This is fire-and-forget — caller doesn't need to await.
 */
export async function maybeReactToMessage(
    message: OmitPartialGroupDMChannel<DiscordMessage<boolean>>,
    selfId: string | undefined,
): Promise<boolean> {
    if (!message.guild) return false;
    if (!selfId || message.author.id === selfId) return false;
    if (message.author.bot) return false;

    const channelId = message.channel.id;
    const now = Date.now();
    const last = lastReactionAt.get(channelId) ?? 0;
    if (now - last < REACT_COOLDOWN_MS) return false;

    const text = message.content || '';
    if (!text) return false;

    for (const rule of RULES) {
        if (!rule.match.test(text)) continue;
        if (Math.random() >= rule.probability) continue;

        const emoji = rule.emojis[Math.floor(Math.random() * rule.emojis.length)];
        try {
            await message.react(emoji);
            lastReactionAt.set(channelId, now);
            return true;
        } catch (error) {
            // Permission missing or message deleted — silent.
            return false;
        }
    }
    return false;
}
