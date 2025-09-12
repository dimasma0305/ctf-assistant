import { OmitPartialGroupDMChannel, Message as DiscordMessage } from "discord.js";

// Spam detection: track recent messages by user
interface RecentMessage {
  content: string;
  timestamp: number;
  messageId: string;
}

const recentMessages: Record<string, RecentMessage[]> = {};

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
  recentMessages[userId] = recentMessages[userId].filter(msg => now - msg.timestamp < 60000);

  // Add current message
  recentMessages[userId].push({ content, timestamp: now, messageId: message.id });

  // Check for spam: same message 3 times within 1 minute
  const sameMessages = recentMessages[userId].filter(msg => msg.content === content);
  if (sameMessages.length >= 3) {
    // Delete all spam messages (including previous ones)
    for (const spamMessage of sameMessages) {
      try {
        const messageToDelete = await message.channel.messages.fetch(spamMessage.messageId);
        await messageToDelete.delete();
      } catch (error) {
        console.log(`Could not delete message ${spamMessage.messageId}: ${error}`);
      }
    }
    
    // Don't kick if it's only stickers
    if (!isOnlySticker) {
      // Ban the user from the guild
      if (message.member && message.guild) {
        await message.member.kick("Spamming the same message multiple times");
      }
      try {
        await message.author.send("You have been banned for spamming the same message multiple times.");
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
