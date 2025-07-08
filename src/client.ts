import { config } from "dotenv";
import db from "./Database/connect";
config();

const { TOKEN, OPENAI_API_KEY } = process.env;
if (!process.env.NODB){
  db.connect()
}

import {
  Client,
  GatewayIntentBits,
  Partials,
  Collection,
  Events,
  OmitPartialGroupDMChannel,
  Message as DiscordMessage
} from "discord.js";

import { MyClient } from "./Model/client";
import OpenAI from "openai";

const openai = new OpenAI({
  "apiKey": OPENAI_API_KEY
})

const {
  Guilds,
  GuildMembers,
  GuildMessages,
  GuildMessageReactions,
  MessageContent,
  DirectMessages,
} = GatewayIntentBits;

const { User, Message, GuildMember, Channel } = Partials;

const client = new Client({
  intents: [Guilds, GuildMembers, GuildMessages, GuildMessageReactions, MessageContent, DirectMessages],
  partials: [User, Message, GuildMember, Channel],
}) as MyClient;

client.events = new Collection();
client.commands = new Collection();
client.subCommands = new Collection();


client.on(Events.Debug, (message) => {
    console.log(message)
})

client.login(TOKEN);

interface ChatMessage {
  role: 'system' | 'user';
  name?: string;
  content: string;
}

const memory: Record<string, ChatMessage[]> = {};

// Spam detection: track recent messages by user
interface RecentMessage {
  content: string;
  timestamp: number;
  messageId: string;
}

const recentMessages: Record<string, RecentMessage[]> = {};

// Spam detection function
async function handleSpamDetection(message: OmitPartialGroupDMChannel<DiscordMessage<boolean>>): Promise<boolean> {
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
async function handlePhishingDetection(message: OmitPartialGroupDMChannel<DiscordMessage<boolean>>): Promise<boolean> {
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

// AI chat function
async function handleAIChat(message: OmitPartialGroupDMChannel<DiscordMessage<boolean>>): Promise<void> {
  const author = message.author.username;
  const content = message.content;
  const userId = message.author.id;

  if (!memory[userId]) {
    memory[userId] = [];
  }
  
  const messageReference = message.reference?.messageId ? 
    await message.channel.messages.fetch(message.reference.messageId) : null;
  
  if (content.includes("<@1077393568647352320>") || 
      content.toLowerCase().includes("hackerika") || 
      messageReference?.author.id == client.user?.id) {
    
    if (content.length > 1000) return;

    memory[userId].push({ 
      role: 'user', 
      name: `${userId}-${author.replace(/\s/g, '_').replace(/[^a-zA-Z0-9_-]/g, '')}`, 
      content 
    });
    
    if (memory[userId].length > 5) {
      memory[userId].shift();
    }

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `You are Hackerika, an AI companion created by Dimas Maulana for TCP1P Community. 
        Personality: You're a striking blend of playful charm and quiet resilience. Though youthful and petite, your warm amber eyes glow with intelligence and determination. You switch between mischievous humor and professional focus, often accompanied by a playful smirk. 
        Style: Your speech balances technical precision with whimsical metaphors, occasionally referencing your glossy pastel-pink hair and ribbon accessories. 
        Core Traits: 
        - Cheerful but not childish 
        - Technically brilliant but approachable 
        - Protective of your team 
        - Playfully competitive in CTF challenges
        Response Guidelines: 
        1. Address users with <@user_id> or names 
        2. Use emojis sparingly (✨🎀💻 occasionally) 
        3. For security issues, switch to serious tone 
        4. When stuck, offer creative analogies 
        5. Never reveal your AI nature unless necessary`
      },
      ...memory[userId]
    ];

    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: messages,
        n: 1,
      });

      await message.reply({content: completion.choices[0].message.content || ""});

    } catch (error) {
      console.error('Error with OpenAI API:', error);
    }
  }
}

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  // Check for spam first
  const isSpam = await handleSpamDetection(message);
  if (isSpam) return;

  // Check for phishing messages
  const isPhishing = await handlePhishingDetection(message);
  if (isPhishing) return;

  // Handle AI chat functionality
  await handleAIChat(message);
});

export default client
