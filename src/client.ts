import { config } from "dotenv";
import db from "./Database/connect";
import { isNoDbMode } from "./utils/env";
config();

// Validate environment before proceeding
import { runStartupValidation } from "./utils/validation";
if (!runStartupValidation()) {
  console.error('❌ Startup validation failed. Exiting...');
  process.exit(1);
}

const { TOKEN } = process.env;
if (!isNoDbMode()) {
  await db.connect();
} else {
  console.warn('⚠️  NODB mode enabled, skipping MongoDB connection');
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
import { ConnectionStateManager, ConnectionState } from "./Services/ConnectionStateManager";
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
  partials: [User, Message, GuildMember, Channel]
}) as MyClient;

client.events = new Collection();
client.commands = new Collection();
client.subCommands = new Collection();

// Initialize all services
const connectionStateManager = new ConnectionStateManager();
client.connectionStateManager = connectionStateManager;

const sessionScheduler = new SessionScheduler(client);
client.sessionScheduler = sessionScheduler;

// ===== Enhanced Event Monitoring =====

// Common initialization for both ready and resumed events
function initializeBot() {
  connectionStateManager.setState(ConnectionState.CONNECTED, 'Bot connected');
}

// Ready event - fired when bot first connects
client.on(Events.ClientReady, () => {
  console.log(`✅ Bot is ready! Logged in as ${client.user?.tag}`);
  initializeBot();
});

// Resumed event - fired when session is resumed
client.on(Events.ShardResume, () => {
  console.log('✅ Session RESUMED');
  sessionScheduler.recordResume();
  initializeBot();
});

// ShardReady - fired when shard becomes ready
client.on(Events.ShardReady, async (shardId: number) => {
  console.log(`🎯 Shard ${shardId} ready`);
});

// Debug events - monitor gateway messages
client.on(Events.Debug, async (message) => {
  // Only log important debug messages to reduce noise
  if (message.includes('READY')) {
    console.log('🔍 Gateway: READY received');
  } else if (message.includes('RESUMED')) {
    console.log('🔍 Gateway: RESUMED received');
  } else if (message.includes('Session Limit Information')) {
    console.log('🔍 Gateway:', message);
  } else if (message.includes('Heartbeat acknowledged')) {
    // Heartbeat is working - connection is healthy (don't log to reduce noise)
  } else if (message.includes('Session is invalid') || message.includes('Invalid session')) {
    console.log('⚠️  Gateway: Invalid session detected');
  } else if (message.includes('no session is available')) {
    // Suppress these messages - they occur during normal connection establishment
  } else {
    // Log any other debug messages that might be important
    console.log('🔍 Gateway:', message);
  }
});

// Error event - handle all errors gracefully
client.on('error', async (error) => {
  console.error('💥 Discord client error:', error);
  connectionStateManager.setState(ConnectionState.ERROR, error.message);
  
  // Check if error is session-related
  if (error.message?.includes('session_start_limit') || error.message?.includes('sessions remaining')) {
    console.log('🚫 Session limit error detected');
    await sessionScheduler.handleSessionLimitError(error);
    connectionStateManager.setState(ConnectionState.WAITING_FOR_RESET, 'Session limit reached');
  }
});

// Disconnect event
client.on('disconnect' as any, async () => {
  console.log('🔌 Bot disconnected');
  connectionStateManager.setState(ConnectionState.DISCONNECTED, 'Client disconnected');
});

// Reconnecting event
client.on('reconnecting' as any, () => {
  console.log('🔄 Bot is reconnecting...');
  connectionStateManager.setState(ConnectionState.RECONNECTING, 'Client reconnecting');
});

// Shard errors
client.on(Events.ShardError, (error) => {
  console.error('💥 Shard error:', error);
  connectionStateManager.setState(ConnectionState.ERROR, `Shard error: ${error.message}`);
});

// Enhanced login with smart reconnection
async function loginWithScheduler(maxRetries = 3) {
  let retryCount = 0;
  
  while (retryCount < maxRetries) {
    try {
      console.log(`🔐 Attempting to login to Discord (attempt ${retryCount + 1}/${maxRetries})...`);
      connectionStateManager.setState(ConnectionState.CONNECTING, `Login attempt ${retryCount + 1}`);
      
      // Add jitter to prevent thundering herd
      if (retryCount > 0) {
        const jitter = Math.floor(Math.random() * 5000);
        console.log(`⏱️  Adding ${Math.floor(jitter / 1000)}s jitter...`);
        await new Promise(resolve => setTimeout(resolve, jitter));
      }
      
      await client.login(TOKEN);
      console.log('✅ Successfully logged in to Discord!');
      
      // Cancel any existing scheduled reconnection since we're now connected
      await sessionScheduler.cancelScheduledReconnection();
      return;
      
    } catch (error: any) {
      console.error(`❌ Login attempt ${retryCount + 1} failed:`, error.message);
      
      connectionStateManager.setState(ConnectionState.ERROR, `Login failed: ${error.message}`);
      
      // Handle session limit specifically with scheduler
      if (error.message?.includes('sessions remaining') || error.message?.includes('session_start_limit')) {
        console.log('🚫 Session limit detected, delegating to session scheduler...');
        connectionStateManager.setState(ConnectionState.WAITING_FOR_RESET, 'Session limit reached');
        
        const handled = await sessionScheduler.handleSessionLimitError(error);
        if (handled) {
          console.log('📅 Session scheduler has taken over. Bot will automatically reconnect when limit resets.');
          return;
        } else {
          console.error('⚠️  Failed to parse session limit, falling back to manual retry...');
          console.log('⏳ Waiting 5 minutes before manual retry...');
          await new Promise(resolve => setTimeout(resolve, 5 * 60 * 1000));
        }
      } else {
        // For other errors, use exponential backoff
        const waitTime = Math.min(1000 * Math.pow(2, retryCount), 15000);
        console.error(`⏳ Network/API error, waiting ${waitTime/1000}s before retry...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
      
      retryCount++;
    }
  }
  
  console.error('💥 Max retry attempts reached. The bot will remain inactive until manual intervention.');
  console.log('ℹ️  Connection state:', connectionStateManager.getSummary());
  console.log('ℹ️  Session scheduler status:', sessionScheduler.getStatus());
}

// Handle graceful shutdown with comprehensive cleanup
process.on('SIGINT', async () => {
  console.log('📴 Received SIGINT. Gracefully shutting down...');
  await performGracefulShutdown();
});

process.on('SIGTERM', async () => {
  console.log('📴 Received SIGTERM. Gracefully shutting down...');
  await performGracefulShutdown();
});

async function performGracefulShutdown() {
  try {
    // Log final metrics
    console.log('📊 Final metrics before shutdown:');
    console.log('📊 Connection health:', connectionStateManager.getSummary());
    console.log('📊 Session usage:', sessionScheduler.getSessionUsage());
    
    // Cancel scheduled tasks
    await sessionScheduler.cancelScheduledReconnection();
    
    // Destroy client connection
    connectionStateManager.setState(ConnectionState.DISCONNECTED, 'Graceful shutdown');
    client.destroy();
    
    console.log('✅ Shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
}

// ===== Periodic Monitoring and Health Checks =====

// Monitor session scheduler status
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

// Periodic health and metrics logging
setInterval(() => {
  console.log('📊 === Periodic Health Report ===');
  console.log('   ' + connectionStateManager.getSummary());
  
  const sessionUsage = sessionScheduler.getSessionUsage();
  console.log(`   Session: ${sessionUsage.identifyCalls} IDENTIFY, ${sessionUsage.resumeCalls} RESUME (${sessionUsage.usagePercent.toFixed(1)}% used)`);
}, 30 * 60 * 1000); // Log every 30 minutes

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
