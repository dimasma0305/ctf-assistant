import { OmitPartialGroupDMChannel, Message as DiscordMessage } from "discord.js";
import { getChannelCache, updateChannelCache, SimplifiedMessage } from "./cache";


// Generate unique separator to prevent prompt injection
export function generateUniqueSeparator(): string {
  return `---${Date.now()}-${Math.random().toString(36).substring(2, 15)}---`;
}

// Token-budget knobs for channel context.
const CHANNEL_CONTEXT_LIMIT = 6;
const PER_MESSAGE_CHAR_LIMIT = 200;

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
}

// Compact channel context — last N messages, each truncated to a fixed budget.
export async function getChannelContext(message: OmitPartialGroupDMChannel<DiscordMessage<boolean>>, startSep: string, endSep: string): Promise<string> {
  try {
    const channelId = message.channel.id;
    let contextMessages: string[];

    const cachedMessages = await getChannelCache(channelId);
    const sliceCount = CHANNEL_CONTEXT_LIMIT + 1; // +1 because the current msg may be at the tail
    const relevantCachedMessages = cachedMessages.slice(Math.max(0, cachedMessages.length - sliceCount), -1);

    if (relevantCachedMessages.length >= 3) {
      contextMessages = relevantCachedMessages.slice(-CHANNEL_CONTEXT_LIMIT).map((msg: SimplifiedMessage) => {
        const authorName = msg.member?.displayName || msg.author.username;
        let content = msg.content;
        if (!content) {
          if (msg.system || msg.type !== 0) content = '[sys]';
          else if (msg.attachments && msg.embeds) content = '[attach+embed]';
          else if (msg.attachments) content = '[attach]';
          else if (msg.embeds) content = '[embed]';
          else content = '[empty]';
        }
        return `${authorName}: ${truncate(content, PER_MESSAGE_CHAR_LIMIT)}`;
      });
    } else {
      const fetchedMessages = await message.channel.messages.fetch({ limit: CHANNEL_CONTEXT_LIMIT, before: message.id });
      const messageArray = Array.from(fetchedMessages.values()).reverse();

      // prime cache for next turn
      for (const msg of messageArray) {
        await updateChannelCache(msg as DiscordMessage);
      }

      contextMessages = messageArray.map(msg => {
        const authorName = msg.member?.displayName || msg.author.username;
        let content = msg.content;
        if (!content) {
          if (msg.system || msg.type !== 0) content = '[sys]';
          else if (msg.attachments.size > 0 && msg.embeds.length > 0) content = '[attach+embed]';
          else if (msg.attachments.size > 0) content = '[attach]';
          else if (msg.embeds.length > 0) content = '[embed]';
          else content = '[empty]';
        }
        return `${authorName}: ${truncate(content, PER_MESSAGE_CHAR_LIMIT)}`;
      });
    }

    return contextMessages.length > 0
      ? `\n${startSep}\n${contextMessages.join('\n')}\n${endSep}`
      : '';
  } catch (error) {
    console.error('Error fetching channel context:', error);
    return '';
  }
}

// Compact user info — drop low-value fields like server-boost / join date.
export async function getUserInfo(message: OmitPartialGroupDMChannel<DiscordMessage<boolean>>): Promise<string> {
  try {
    const member = message.member;
    if (!member) return `${message.author.username} (${message.author.id})`;

    const roles = member.roles.cache
      .filter(role => role.name !== '@everyone')
      .map(role => role.name)
      .slice(0, 3);
    const nickname = member.displayName !== message.author.username ? ` aka ${member.displayName}` : '';
    const rolesPart = roles.length > 0 ? ` [${roles.join(', ')}]` : '';
    return `${message.author.username}${nickname} (${message.author.id})${rolesPart}`;
  } catch (error) {
    console.error('Error getting user info:', error);
    return `${message.author.username} (${message.author.id})`;
  }
}

const REPLY_CONTEXT_CHAR_LIMIT = 400;

export async function getReplyContext(
  message: OmitPartialGroupDMChannel<DiscordMessage<boolean>>,
  startSep: string,
  endSep: string,
  prefetched?: DiscordMessage | null
): Promise<string> {
  try {
    if (!message.reference?.messageId) return '';

    const referencedMessage = prefetched ?? await message.channel.messages.fetch(message.reference.messageId);
    const referencedAuthor = referencedMessage.member?.displayName || referencedMessage.author.username;
    const referencedContent = truncate(referencedMessage.content || '[attachment/embed]', REPLY_CONTEXT_CHAR_LIMIT);

    return `\n${startSep}\n${referencedAuthor}: ${referencedContent}\n${endSep}`;
  } catch (error) {
    console.error('Error getting reply context:', error);
    return '';
  }
}

// Compact environment context — single line, only fields the model uses.
export function getEnvironmentContext(message: OmitPartialGroupDMChannel<DiscordMessage<boolean>>): string {
  const guildName = message.guild?.name || 'DM';
  const channel = message.channel as any;
  const channelName = channel?.name ? `#${channel.name}` : 'DM';
  const channelTopic = channel?.topic ? truncate(channel.topic, 120) : '';
  const isNSFW = channel?.nsfw ? ' nsfw' : '';

  let purpose = 'general';
  const ln = channelName.toLowerCase();
  if (ln.includes('ctf') || ln.includes('challenge')) purpose = 'ctf';
  else if (ln.includes('help') || ln.includes('support')) purpose = 'help';
  else if (ln.includes('announce') || ln.includes('info')) purpose = 'announce';
  else if (ln.includes('mabar')) purpose = 'mabar';
  else if (ln.includes('off') && ln.includes('topic')) purpose = 'off-topic';
  else if (ln.includes('resource') || ln.includes('tool')) purpose = 'resources';

  const now = new Date();
  const timeStr = now.toLocaleString('id-ID', { hour12: false, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

  const topicPart = channelTopic ? ` topic="${channelTopic}"` : '';
  return `guild=${guildName} channel=${channelName} purpose=${purpose}${isNSFW}${topicPart} time=${timeStr}`;
}
