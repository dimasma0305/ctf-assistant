import { config } from "dotenv";
import db from "./Database/connect";
config();

// Validate environment before proceeding
import { runStartupValidation } from "./utils/validation";
if (!runStartupValidation()) {
  console.error('❌ Startup validation failed. Exiting...');
  process.exit(1);
}

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
import { ConnectionStateManager, ConnectionState } from "./Services/ConnectionStateManager";
import { HealthMonitor } from "./Services/HealthMonitor";
import { RateLimitManager } from "./Services/RateLimitManager";
import { MetricsCollector } from "./Services/MetricsCollector";
import { SessionPersistence } from "./Services/SessionPersistence";
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

// Initialize all services
const connectionStateManager = new ConnectionStateManager();
client.connectionStateManager = connectionStateManager;

const sessionScheduler = new SessionScheduler(client);
client.sessionScheduler = sessionScheduler;

const rateLimitManager = new RateLimitManager();
client.rateLimitManager = rateLimitManager;

const healthMonitor = new HealthMonitor(client);
client.healthMonitor = healthMonitor;

const metricsCollector = new MetricsCollector(client);
client.metricsCollector = metricsCollector;

const sessionPersistence = new SessionPersistence(client);
client.sessionPersistence = sessionPersistence;


// ===== Enhanced Event Monitoring =====

// Ready event - fired when bot first connects
client.on(Events.ClientReady, () => {
  console.log(`✅ Bot is ready! Logged in as ${client.user?.tag}`);
  connectionStateManager.setState(ConnectionState.CONNECTED, 'Bot ready');
  
  // Check if this was a RESUME or fresh IDENTIFY
  // If we had a saved session, this might have been a RESUME
  if (sessionPersistence.hasValidSession()) {
    console.log('✅ Connection established via RESUME (no IDENTIFY used!)');
    sessionScheduler.recordResume();
  } else {
    console.log('✅ Connection established via IDENTIFY');
    sessionScheduler.recordIdentify();
  }
  
  // Start capturing session data for next restart
  sessionPersistence.startCapture();
  
  healthMonitor.start(); // Start health monitoring
});

// Resumed event - fired when session is resumed (no IDENTIFY used!)
client.on('resumed' as any, () => {
  console.log('✅ Session RESUMED (no IDENTIFY call made)');
  connectionStateManager.setState(ConnectionState.CONNECTED, 'Session resumed');
  sessionScheduler.recordResume(); // Track RESUME separately
});

// Debug events - monitor gateway messages
client.on(Events.Debug, (message) => {
  // Only log important debug messages to reduce noise
  if (message.includes('READY')) {
    console.log('🔍 Gateway: READY received');
  } else if (message.includes('RESUMED')) {
    console.log('🔍 Gateway: RESUMED received');
  } else if (message.includes('Session Limit Information')) {
    console.log('🔍 Gateway:', message);
  } else if (message.includes('Heartbeat acknowledged')) {
    // Heartbeat is working - connection is healthy
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
client.on('disconnect' as any, () => {
  console.log('🔌 Bot disconnected');
  connectionStateManager.setState(ConnectionState.DISCONNECTED, 'Client disconnected');
  healthMonitor.stop();
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

// Enhanced login with rate limit checking, session persistence, and smart reconnection
async function loginWithScheduler(maxRetries = 3) {
  let retryCount = 0;
  
  // Load saved session data (do this once at startup)
  if (retryCount === 0) {
    await sessionPersistence.initialize();
  }
  
  while (retryCount < maxRetries) {
    // Check rate limits before attempting connection
    const rateLimitCheck = rateLimitManager.canAttemptConnection();
    if (!rateLimitCheck.allowed) {
      console.warn(`⏳ Rate limit: ${rateLimitCheck.reason}`);
      if (rateLimitCheck.waitTimeMs) {
        const waitSec = Math.ceil(rateLimitCheck.waitTimeMs / 1000);
        console.log(`⏳ Waiting ${waitSec}s before retry...`);
        await new Promise(resolve => setTimeout(resolve, rateLimitCheck.waitTimeMs));
      }
      continue;
    }

    try {
      console.log(`🔐 Attempting to login to Discord (attempt ${retryCount + 1}/${maxRetries})...`);
      connectionStateManager.setState(ConnectionState.CONNECTING, `Login attempt ${retryCount + 1}`);
      
      // Check if we have a saved session to resume
      const hasValidSession = sessionPersistence.hasValidSession();
      if (hasValidSession) {
        console.log('🔄 Found valid saved session, will attempt RESUME instead of IDENTIFY');
        const sessionStatus = sessionPersistence.getStatus();
        console.log(`   Session expires in ${Math.floor((sessionStatus.timeUntilExpiry || 0) / 1000)}s`);
        
        // Attempt to inject session data for RESUME
        await sessionPersistence.attemptSessionResume();
      } else {
        console.log('🆕 No saved session, will use fresh IDENTIFY');
      }
      
      // Add jitter to prevent thundering herd
      const jitter = RateLimitManager.generateJitter();
      if (retryCount > 0) {
        console.log(`⏱️  Adding ${Math.floor(jitter / 1000)}s jitter...`);
        await new Promise(resolve => setTimeout(resolve, jitter));
      }
      
      await client.login(TOKEN);
      console.log('✅ Successfully logged in to Discord!');
      
      // Record successful login (only if it wasn't a RESUME)
      if (!hasValidSession) {
        rateLimitManager.recordIdentify(true);
      } else {
        console.log('✅ RESUME successful - no session consumed!');
      }
      
      // Cancel any existing scheduled reconnection since we're now connected
      await sessionScheduler.cancelScheduledReconnection();
      return;
      
    } catch (error: any) {
      console.error(`❌ Login attempt ${retryCount + 1} failed:`, error.message);
      
      // Check if RESUME failed - clear saved session and retry with IDENTIFY
      if (sessionPersistence.hasValidSession() && error.message?.includes('Invalid session')) {
        console.warn('⚠️  RESUME failed with invalid session, clearing saved session data...');
        await sessionPersistence.clearSessionData();
        console.log('🔄 Will retry with fresh IDENTIFY');
        // Don't count this as a retry - just clear the session and try again
        continue;
      }
      
      rateLimitManager.recordIdentify(false);
      connectionStateManager.setState(ConnectionState.ERROR, `Login failed: ${error.message}`);
      
      // Handle session limit specifically with scheduler
      if (error.message?.includes('sessions remaining') || error.message?.includes('session_start_limit')) {
        console.log('🚫 Session limit detected, delegating to session scheduler...');
        connectionStateManager.setState(ConnectionState.WAITING_FOR_RESET, 'Session limit reached');
        
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
  console.log('ℹ️  Connection state:', connectionStateManager.getSummary());
  console.log('ℹ️  Session scheduler status:', sessionScheduler.getStatus());
  console.log('ℹ️  Rate limit status:', rateLimitManager.getStatus());
  console.log('ℹ️  Session persistence status:', sessionPersistence.getStatus());
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
    metricsCollector.logMetrics();
    console.log('📊 Connection health:', connectionStateManager.getSummary());
    console.log('📊 Session usage:', sessionScheduler.getSessionUsage());
    console.log('📊 Session persistence:', sessionPersistence.getStatus());
    
    // Save session data for next restart (CRITICAL for RESUME)
    await sessionPersistence.saveBeforeShutdown();
    
    // Stop health monitoring
    healthMonitor.stop();
    
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
  console.log('   ' + metricsCollector.getSummary());
  console.log('   ' + healthMonitor.getHealthSummary());
  
  const sessionUsage = sessionScheduler.getSessionUsage();
  console.log(`   Session: ${sessionUsage.identifyCalls} IDENTIFY, ${sessionUsage.resumeCalls} RESUME (${sessionUsage.usagePercent.toFixed(1)}% used)`);
  
  const rateLimitStatus = rateLimitManager.getStatus();
  console.log(`   Rate limit: ${rateLimitStatus.remaining}/${rateLimitStatus.limit} remaining`);
  
  const sessionPersistenceStatus = sessionPersistence.getStatus();
  if (sessionPersistenceStatus.hasSession) {
    const timeRemaining = Math.floor((sessionPersistenceStatus.timeUntilExpiry || 0) / 1000);
    console.log(`   Saved session: ${sessionPersistenceStatus.isExpired ? 'EXPIRED' : `Valid (expires in ${timeRemaining}s)`}`);
  } else {
    console.log('   Saved session: None');
  }
}, 30 * 60 * 1000); // Log every 30 minutes

// Check for zombie connections and trigger recovery
healthMonitor.on('zombieConnection', async ({ timeSinceLastEvent }) => {
  console.error(`🧟 Zombie connection detected! No events for ${Math.floor(timeSinceLastEvent / 60000)} minutes`);
  console.log('🔄 Triggering reconnection to recover...');
  
  // Destroy and reconnect
  client.destroy();
  await new Promise(resolve => setTimeout(resolve, 5000));
  loginWithScheduler();
});

// Monitor for unhealthy state
healthMonitor.on('unhealthy', ({ issues }) => {
  console.error('🚨 Health monitor detected unhealthy state:', issues);
  console.log('ℹ️  Current metrics:', metricsCollector.getSummary());
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
