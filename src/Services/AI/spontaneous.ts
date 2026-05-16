import { Message as DiscordMessage, OmitPartialGroupDMChannel } from "discord.js";
import { loadProfile } from "./userProfile";
import { jakartaHour } from "./botState";

// Channel-level cooldown for spontaneous chime-ins. Prevents her from being
// a chatty bot that always pipes up.
const CHANNEL_COOLDOWN_MS = 8 * 60_000;     // 8 minutes between unsolicited chimes per channel
const USER_COOLDOWN_MS = 5 * 60_000;        // 5 minutes per user
const lastChannelChimeAt = new Map<string, number>();
const lastUserChimeAt = new Map<string, number>();

// Quiet hours (Jakarta time) — she shouldn't randomly chime when most people
// are asleep, that feels intrusive.
function isQuietHour(): boolean {
    const h = jakartaHour();
    return h >= 0 && h < 7;
}

// Topic keywords that boost the chance of her chiming in (her "interests")
const INTEREST_KEYWORDS = [
    /\b(ctf|exploit|vulner|payload|injection|sqli|xss|rce|lfi|ssrf|csrf|xxe|prototype pollution|race condition|deserialization|jwt|oauth)\b/i,
    /\b(reverse engineering|reversing|disasm|disassembl|ghidra|ida pro|radare)\b/i,
    /\b(forensic|forensics|memdump|volatility|wireshark|pcap|stego|steganography)\b/i,
    /\b(crypto(?!\s*currency)|kriptografi|rsa|aes|hash|hashing)\b/i,
    /\b(pwning|pwn|buffer overflow|rop|heap)\b/i,
    /\b(discord bot|claude|chatgpt|deepseek|llm|ai|model)\b/i,
    /\b(writeup|write-up|nge?-?solve)\b/i,
];

interface DecisionResult {
    shouldChime: boolean;
    reason: string;
    promptHint: string;
}

export async function shouldChimeIn(
    message: OmitPartialGroupDMChannel<DiscordMessage<boolean>>,
    selfId: string | undefined,
): Promise<DecisionResult> {
    if (!message.guild) return { shouldChime: false, reason: 'no guild', promptHint: '' };
    if (!selfId || message.author.id === selfId) return { shouldChime: false, reason: 'self', promptHint: '' };
    if (message.author.bot) return { shouldChime: false, reason: 'bot author', promptHint: '' };

    const content = message.content || '';
    if (content.length < 8) return { shouldChime: false, reason: 'too short', promptHint: '' };
    if (content.length > 600) return { shouldChime: false, reason: 'too long, probably not casual', promptHint: '' };

    // Already addressed → handled by the normal AI path, not this one.
    if (content.toLowerCase().includes('hackerika')) return { shouldChime: false, reason: 'addressed', promptHint: '' };
    if (selfId && content.includes(`<@${selfId}>`)) return { shouldChime: false, reason: 'mentioned', promptHint: '' };

    if (isQuietHour()) return { shouldChime: false, reason: 'quiet hour', promptHint: '' };

    const now = Date.now();
    const channelId = message.channel.id;
    if (now - (lastChannelChimeAt.get(channelId) ?? 0) < CHANNEL_COOLDOWN_MS) {
        return { shouldChime: false, reason: 'channel cooldown', promptHint: '' };
    }
    if (now - (lastUserChimeAt.get(message.author.id) ?? 0) < USER_COOLDOWN_MS) {
        return { shouldChime: false, reason: 'user cooldown', promptHint: '' };
    }

    // Score the message for chime-worthiness.
    let baseProbability = 0.012;  // ~1.2% baseline
    const hits: string[] = [];

    for (const re of INTEREST_KEYWORDS) {
        if (re.test(content)) {
            baseProbability += 0.05;
            hits.push('topic-interest');
            break;  // only count once
        }
    }

    // Profile-based boost — if she has a positive opinion of this user,
    // she's more likely to chime in.
    try {
        const profile = await loadProfile(message.author.id);
        if (profile) {
            const opinion = (profile.opinion || '').toLowerCase();
            if (/\b(suka|respect|seneng|gemas|sayang|asik|menarik|fav)/.test(opinion)) {
                baseProbability += 0.04;
                hits.push('liked-user');
            } else if (/\b(nyebelin|annoying|capek|ga\s*suka|males)/.test(opinion)) {
                baseProbability -= 0.05;
                hits.push('disliked-user');
            }
            // High interaction count = familiar, more likely to chime
            if (profile.interactionCount >= 20) {
                baseProbability += 0.02;
                hits.push('familiar');
            }
        }
    } catch {
        // Profile lookup failure — ignore.
    }

    // Clamp.
    baseProbability = Math.max(0, Math.min(0.12, baseProbability));

    if (Math.random() >= baseProbability) {
        return { shouldChime: false, reason: `dice miss (p=${baseProbability.toFixed(3)} hits=${hits.join(',')})`, promptHint: '' };
    }

    // Mark cooldowns BEFORE returning — even a started chime that fails
    // mid-flight shouldn't lead to immediate retries.
    lastChannelChimeAt.set(channelId, now);
    lastUserChimeAt.set(message.author.id, now);

    return {
        shouldChime: true,
        reason: `chiming (p=${baseProbability.toFixed(3)} hits=${hits.join(',')})`,
        promptHint: hits.includes('topic-interest')
            ? 'topic seems up your alley'
            : hits.includes('liked-user')
                ? 'this is a user you like'
                : 'just feel like nimbrung',
    };
}
