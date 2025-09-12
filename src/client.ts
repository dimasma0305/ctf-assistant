import { config } from "dotenv";
import db from "./Database/connect";
config();

const { TOKEN } = process.env;
if (!process.env.NODB){
  db.connect()
}

import {
  Client,
  GatewayIntentBits,
  Partials,
  Collection,
  Events,
  Message as DiscordMessage
} from "discord.js";

import { MyClient } from "./Model/client";
import { SessionScheduler } from "./Services/SessionScheduler";
import { handleAIChat, updateChannelCache } from "./Services/AI";
import { handleSpamDetection, handlePhishingDetection } from "./Services/Moderation";
import "./Services/AI/memory";


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


client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  // --- Update Channel Cache ---
  updateChannelCache(message as DiscordMessage)
  // --- End Update Channel Cache ---

  // Check for spam first
  const isSpam = await handleSpamDetection(message);
  if (isSpam) return;

  // Check for phishing messages
  const isPhishing = await handlePhishingDetection(message);
  if (isPhishing) return;

  // Handle AI chat functionality
  await handleAIChat(message, client);
});

export default client
