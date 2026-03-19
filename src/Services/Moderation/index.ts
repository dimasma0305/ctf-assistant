import { Collection, Guild, Message as DiscordMessage, OmitPartialGroupDMChannel } from "discord.js";

// Spam detection: track recent messages by user
interface RecentMessage {
  content: string;
  timestamp: number;
  messageId: string;
}

const recentMessages: Record<string, RecentMessage[]> = {};
const SPAM_WINDOW_MS = 60_000;
const SPAM_KICK_CLEANUP_WINDOW_MS = 5 * 60_000;
const MESSAGE_FETCH_BATCH_SIZE = 100;

interface MessageFetchChannel {
  id: string;
  isTextBased(): boolean;
  messages: {
    fetch(options: {
      limit: number;
      before?: string;
    }): Promise<Collection<string, DiscordMessage<boolean>>>;
  };
}

function isMessageFetchChannel(channel: unknown): channel is MessageFetchChannel {
  if (!channel || typeof channel !== "object") {
    return false;
  }

  if (!("isTextBased" in channel) || typeof channel.isTextBased !== "function") {
    return false;
  }

  return channel.isTextBased() && "messages" in channel;
}

async function deleteMessagesById(
  message: OmitPartialGroupDMChannel<DiscordMessage<boolean>>,
  messageIds: string[],
): Promise<void> {
  for (const messageId of messageIds) {
    try {
      const messageToDelete = await message.channel.messages.fetch(messageId);
      await messageToDelete.delete();
    } catch (error) {
      console.log(`Could not delete message ${messageId}: ${error}`);
    }
  }
}

async function deleteRecentMessagesFromUser(
  message: OmitPartialGroupDMChannel<DiscordMessage<boolean>>,
  userId: string,
  cutoffTimestamp: number,
): Promise<number> {
  if (!message.guild) {
    return 0;
  }

  const channels = await message.guild.channels.fetch();
  let deletedCount = 0;

  for (const [, channel] of channels) {
    if (!isMessageFetchChannel(channel)) {
      continue;
    }

    let before: string | undefined;

    while (true) {
      let messages: Collection<string, DiscordMessage<boolean>>;

      try {
        messages = await channel.messages.fetch({
          limit: MESSAGE_FETCH_BATCH_SIZE,
          before,
        });
      } catch (error) {
        console.log(`Could not fetch messages from channel ${channel.id}: ${error}`);
        break;
      }

      if (messages.size === 0) {
        break;
      }

      for (const [, fetchedMessage] of messages) {
        if (fetchedMessage.createdTimestamp < cutoffTimestamp) {
          continue;
        }

        if (fetchedMessage.author.id !== userId) {
          continue;
        }

        try {
          await fetchedMessage.delete();
          deletedCount++;
        } catch (error) {
          console.log(`Could not delete recent message ${fetchedMessage.id}: ${error}`);
        }
      }

      const oldestMessage = messages.last();
      if (!oldestMessage || oldestMessage.createdTimestamp < cutoffTimestamp || messages.size < MESSAGE_FETCH_BATCH_SIZE) {
        break;
      }

      before = oldestMessage.id;
    }
  }

  return deletedCount;
}

// Spam detection function
export async function handleSpamDetection(message: OmitPartialGroupDMChannel<DiscordMessage<boolean>>): Promise<boolean> {
  const userId = message.author.id;
  const content = message.content;
  const now = Date.now();

  // Check if message is only a sticker (has stickers and no/minimal text content)
  const isOnlySticker = message.stickers?.size > 0 && (!content || content.trim().length === 0);

  // Initialize user's recent messages if not exists
  if (!recentMessages[userId]) {
    recentMessages[userId] = [];
  }

  // Clean old messages (older than 1 minute)
  recentMessages[userId] = recentMessages[userId].filter(msg => now - msg.timestamp < SPAM_WINDOW_MS);

  // Add current message
  recentMessages[userId].push({ content, timestamp: now, messageId: message.id });

  // Check for spam: same message 3 times within 1 minute
  const sameMessages = recentMessages[userId].filter(msg => msg.content === content);
  if (sameMessages.length >= 3) {
    await deleteMessagesById(message, sameMessages.map((spamMessage) => spamMessage.messageId));
    
    // Don't kick if it's only stickers
    if (!isOnlySticker) {
      if (message.member && message.guild) {
        try {
          await message.member.kick("Spamming the same message multiple times");

          const deletedRecentMessageCount = await deleteRecentMessagesFromUser(
            message,
            userId,
            now - SPAM_KICK_CLEANUP_WINDOW_MS,
          );

          console.log(
            `Deleted ${deletedRecentMessageCount} recent message(s) from spammer ${userId} after kick.`,
          );
        } catch (error) {
          console.log(`Could not kick spammer ${userId}: ${error}`);
        }
      }
      try {
        await message.author.send("You have been kicked for spamming the same message multiple times.");
      } catch (error) {
        console.log("Could not send DM to user");
      }
    }
    
    // Clear user's message history to prevent further checks
    delete recentMessages[userId];
    return true; // Message was spam and handled
  }
  
  return false; // Not spam
}

// Phishing detection function
export async function handlePhishingDetection(message: OmitPartialGroupDMChannel<DiscordMessage<boolean>>): Promise<boolean> {
  const phishingMessage = [
    /50\$ gift - /,
  ];

  if (phishingMessage.some(regex => regex.test(message.content))) {
    await message.delete();
    // Ban the user from the guild
    if (message.member && message.guild) {
      await message.member.kick("Sending phishing messages");
    }
    try {
      await message.author.send("You have been banned for sending phishing messages.");
    } catch (error) {
      console.log("Could not send DM to user");
    }
    return true; // Message was phishing and handled
  }
  
  return false; // Not phishing
}

// Recursively sanitize content to remove @everyone, @here, and role mentions
export function sanitizeMentions(content: string | object | any[], guild?: Guild | null): any {
  // Handle strings
  if (typeof content === 'string') {
    let sanitized = content
      .replace(/@everyone/gi, '@\u200beveryone') // Insert zero-width space
      .replace(/@here/gi, '@\u200bhere'); // Insert zero-width space
    
    // Handle role mentions: <@&roleId> -> @<rolet>
    if (guild) {
      sanitized = sanitized.replace(/<@&(\d+)>/g, (match, roleId) => {
        try {
          const role = guild.roles.cache.get(roleId);
          if (role) {
            return `@${role.name}`;
          }
          return '@rolet'; // Fallback if role not found
        } catch (error) {
          return '@rolet'; // Fallback on error
        }
      });
    } else {
      // If no guild provided, just replace with generic placeholder
      sanitized = sanitized.replace(/<@&\d+>/g, '@<rolet>');
    }
    
    return sanitized;
  }
  
  // Handle arrays
  if (Array.isArray(content)) {
    return content.map(item => sanitizeMentions(item, guild));
  }
  
  // Handle objects (including null)
  if (content && typeof content === 'object') {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(content)) {
      sanitized[key] = sanitizeMentions(value, guild);
    }
    return sanitized;
  }
  
  // Return primitive values unchanged
  return content;
}
