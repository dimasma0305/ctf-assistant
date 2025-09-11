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
import { SessionScheduler } from "./Services/SessionScheduler";

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

// Initialize session scheduler
const sessionScheduler = new SessionScheduler(client);
client.sessionScheduler = sessionScheduler;


// Reduced debug logging to prevent unnecessary session usage
client.on(Events.Debug, (message) => {
    // Only log important debug messages to reduce noise
    if (message.includes('READY') || message.includes('RESUMED') || message.includes('error')) {
        console.log(message);
    }
});

// Enhanced error handling with session limit detection
client.on('error', (error) => {
  console.error('Discord client error:', error);
  
  // Don't exit immediately on errors - let reconnection logic handle it
  if (error.message?.includes('session_start_limit') || error.message?.includes('sessions remaining')) {
    console.error('Session limit reached. Bot will wait for limit reset.');
    return;
  }
});

client.on('disconnect', () => {
  console.log('Bot disconnected');
});

client.on('clientReady', () => {
  console.log(`Bot is ready! Logged in as ${client.user?.tag}`);
});

// Enhanced login with session scheduler integration
async function loginWithScheduler(maxRetries = 3) {
  let retryCount = 0;
  
  while (retryCount < maxRetries) {
    try {
      console.log(`🔐 Attempting to login to Discord (attempt ${retryCount + 1}/${maxRetries})...`);
      await client.login(TOKEN);
      console.log('✅ Successfully logged in to Discord!');
      
      // Cancel any existing scheduled reconnection since we're now connected
      await sessionScheduler.cancelScheduledReconnection();
      return;
      
    } catch (error: any) {
      console.error(`❌ Login attempt ${retryCount + 1} failed:`, error.message);
      
      // Handle session limit specifically with scheduler
      if (error.message?.includes('sessions remaining') || error.message?.includes('session_start_limit')) {
        console.log('🚫 Session limit detected, delegating to session scheduler...');
        
        const handled = await sessionScheduler.handleSessionLimitError(error);
        if (handled) {
          console.log('📅 Session scheduler has taken over. Bot will automatically reconnect when limit resets.');
          // Don't exit - let the scheduler handle reconnection
          return;
        } else {
          console.error('⚠️  Failed to parse session limit, falling back to manual retry...');
          // Fallback: wait 5 minutes and retry
          console.log('⏳ Waiting 5 minutes before manual retry...');
          await new Promise(resolve => setTimeout(resolve, 5 * 60 * 1000));
        }
      } else {
        // For other errors, use exponential backoff (but shorter retries)
        const waitTime = Math.min(1000 * Math.pow(2, retryCount), 15000); // Max 15 seconds
        console.error(`⏳ Network/API error, waiting ${waitTime/1000}s before retry...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
      
      retryCount++;
    }
  }
  
  console.error('💥 Max retry attempts reached. The bot will remain inactive until manual intervention.');
  console.log('ℹ️  Check session scheduler status:', sessionScheduler.getStatus());
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('📴 Received SIGINT. Gracefully shutting down...');
  await sessionScheduler.cancelScheduledReconnection();
  client.destroy();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('📴 Received SIGTERM. Gracefully shutting down...');
  await sessionScheduler.cancelScheduledReconnection();
  client.destroy();
  process.exit(0);
});

// Add monitoring for session scheduler status
setInterval(() => {
  const status = sessionScheduler.getStatus();
  if (status.isWaitingForReset) {
    console.log('🕐 Session Scheduler Status:', {
      waitingForReset: status.isWaitingForReset,
      nextReset: status.nextResetTime,
      currentTime: new Date().toISOString()
    });
  }
}, 10 * 60 * 1000); // Log every 10 minutes when waiting

// Handle disconnection with session scheduler awareness
client.on('disconnect', () => {
  console.log('🔌 Bot disconnected');
  if (!sessionScheduler.isWaitingForSessionReset()) {
    console.log('⚡ Attempting automatic reconnection...');
    setTimeout(() => loginWithScheduler(), 5000);
  } else {
    console.log('⏳ Session scheduler is active, not attempting immediate reconnection');
  }
});

// Enhanced error handling with session scheduler
client.on('error', async (error) => {
  console.error('💥 Discord client error:', error);
  
  // Check if error is session-related
  if (error.message?.includes('session_start_limit') || error.message?.includes('sessions remaining')) {
    console.log('🚫 Session limit error detected in client error handler');
    await sessionScheduler.handleSessionLimitError(error);
  }
});

// Start login process with scheduler
console.log('🚀 Starting CTF Assistant Bot...');
loginWithScheduler();

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
        model: 'deepseek-reasoner',
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
