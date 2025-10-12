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

// Load session from database
import { SessionStateModel } from "./Database/connect";

/**
 * Custom sharding strategy with database-backed session persistence
 * This enables RESUME across bot restarts by storing session data in MongoDB
 * Based on Discord.js PR #10420 and @discordjs/ws session management
 */
class DatabaseSessionStrategy {
  private manager: any;
  private strategy: any;
  
  constructor(manager: any) {
    this.manager = manager;
    
    // Import and create the base strategy
    const { SimpleShardingStrategy } = require('@discordjs/ws');
    this.strategy = new SimpleShardingStrategy(manager);
    
    // Override the manager's session callbacks BEFORE any connections
    this.overrideSessionCallbacks();
  }
  
  private async clearSavedSession() {
    try {
      await SessionStateModel.findByIdAndDelete('session_state');
      console.log('🗑️  Cleared invalid session from database');
    } catch (error) {
      console.error('❌ Failed to clear session:', error);
    }
  }
  
  private overrideSessionCallbacks() {
    // Store original callbacks
    const originalRetrieve = this.manager.options.retrieveSessionInfo;
    const originalUpdate = this.manager.options.updateSessionInfo;
    
    // Override retrieveSessionInfo
    this.manager.options.retrieveSessionInfo = async (shardId: number) => {
      try {
        const state = await SessionStateModel.findById('session_state');
        if (state?.persistedSession) {
          const session = state.persistedSession;
          const expiresAt = new Date(session.expiresAt);
          const now = new Date();
          
          if (now < expiresAt && session.sessionId && session.resumeURL) {
            // Only log once per actual resume attempt (not on every check)
            if (!(global as any).attemptedResume) {
              console.log(`🔄 RESUME: Using saved session (seq: ${session.sequence}, expires in ${Math.floor((expiresAt.getTime() - now.getTime()) / 60000)}m)`);
              // Set global flag to track that we're attempting a resume
              (global as any).attemptedResume = true;
            }
            
            return {
              sessionId: session.sessionId,
              sequence: session.sequence || 0,
              resumeURL: session.resumeURL,
              shardId,
              shardCount: 1
            };
          } else {
            console.log('⚠️  Saved session expired or invalid, clearing...');
            await this.clearSavedSession();
          }
        }
      } catch (error) {
        console.error('❌ Session retrieve error:', error);
      }
      
      return null;
    };
    
    // Override updateSessionInfo
    this.manager.options.updateSessionInfo = async (shardId: number, sessionInfo: any) => {
      // Call original first to maintain in-memory state
      if (originalUpdate) {
        await originalUpdate(shardId, sessionInfo);
      }
      
      if (sessionInfo?.sessionId) {
        try {
          const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
          await SessionStateModel.findOneAndUpdate(
            { _id: 'session_state' },
            {
              $set: {
                persistedSession: {
                  sessionId: sessionInfo.sessionId,
                  sequence: sessionInfo.sequence || 0,
                  resumeURL: sessionInfo.resumeURL,
                  shardId,
                  savedAt: new Date(),
                  expiresAt
                }
              }
            },
            { upsert: true }
          );
          console.log(`💾 Session saved to DB (seq: ${sessionInfo.sequence}, expires in 30m)`);
        } catch (error) {
          console.error('❌ Session save error:', error);
        }
      }
    };
  }
  
  // Delegate all IShardingStrategy methods to the base strategy
  spawn(shardIds: number[]) { return this.strategy.spawn(shardIds); }
  connect() { return this.strategy.connect(); }
  destroy(options?: any) { return this.strategy.destroy(options); }
  send(shardId: number, payload: any) { return this.strategy.send(shardId, payload); }
  fetchStatus() { return this.strategy.fetchStatus(); }
}

// Initialize global flag for tracking resume attempts
(global as any).attemptedResume = false;

const client = new Client({
  intents: [Guilds, GuildMembers, GuildMessages, GuildMessageReactions, MessageContent, DirectMessages],
  partials: [User, Message, GuildMember, Channel],
  ws: {
    buildStrategy: (manager: any) => new DatabaseSessionStrategy(manager)
  }
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

// ===== Enhanced Event Monitoring =====

// Common initialization for both ready and resumed events
function initializeBot() {
  connectionStateManager.setState(ConnectionState.CONNECTED, 'Bot connected');
  
  // Start health monitor (safe to call multiple times, has internal check)
  healthMonitor.start();
}

// Ready event - fired when bot first connects (IDENTIFY)
client.on(Events.ClientReady, () => {
  console.log(`✅ Bot is ready! Logged in as ${client.user?.tag}`);
  initializeBot();
  (global as any).attemptedResume = false; // Reset flag on successful IDENTIFY
});

// Resumed event - fired when session is resumed (RESUME, no IDENTIFY used!)
client.on('resumed' as any, () => {
  console.log('✅ Session RESUMED (no IDENTIFY call made)');
  sessionScheduler.recordResume(); // Track RESUME separately
  (global as any).attemptedResume = false; // Reset flag on successful RESUME
  
  // IMPORTANT: Must initialize bot on resume too, since ClientReady doesn't fire on RESUME!
  initializeBot();
});

// ShardReady - fired when shard becomes ready (could be after IDENTIFY or failed RESUME)
client.on(Events.ShardReady, async (shardId: number) => {
  console.log(`🎯 Shard ${shardId} ready`);
  
  // If we attempted to resume but ended up here (not in resumed event), it means RESUME failed
  if ((global as any).attemptedResume) {
    console.log('⚠️  Session RESUME failed, Discord forced new IDENTIFY');
    console.log('🗑️  Clearing saved session from database...');
    try {
      await SessionStateModel.findByIdAndDelete('session_state');
      console.log('✅ Cleared invalid session after failed resume');
    } catch (error) {
      console.error('❌ Failed to clear invalid session:', error);
    }
    (global as any).attemptedResume = false;
  }
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
    console.log('⚠️  Gateway: Invalid session detected in debug message');
    if ((global as any).attemptedResume) {
      console.log('🗑️  Clearing saved session after invalid session message...');
      try {
        await SessionStateModel.findByIdAndDelete('session_state');
        console.log('✅ Cleared invalid session from database');
      } catch (error) {
        console.error('❌ Failed to clear invalid session:', error);
      }
      (global as any).attemptedResume = false;
    }
  }
  console.log('🔍 Gateway:', message);
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

// Enhanced login with rate limit checking and smart reconnection
async function loginWithScheduler(maxRetries = 3) {
  let retryCount = 0;
  
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
      
      // Add jitter to prevent thundering herd
      const jitter = RateLimitManager.generateJitter();
      if (retryCount > 0) {
        console.log(`⏱️  Adding ${Math.floor(jitter / 1000)}s jitter...`);
        await new Promise(resolve => setTimeout(resolve, jitter));
      }
      
      await client.login(TOKEN);
      console.log('✅ Successfully logged in to Discord!');
      
      // Record successful login
      rateLimitManager.recordIdentify(true);
      
      // Cancel any existing scheduled reconnection since we're now connected
      await sessionScheduler.cancelScheduledReconnection();
      return;
      
    } catch (error: any) {
      console.error(`❌ Login attempt ${retryCount + 1} failed:`, error.message);
      
      rateLimitManager.recordIdentify(false);
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
  console.log('ℹ️  Rate limit status:', rateLimitManager.getStatus());
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
