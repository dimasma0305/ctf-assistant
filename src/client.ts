import { config } from "dotenv";
import db from "./Database/connect";
import { isNoDbMode } from "./utils/env";
import { migrateIntegrationSecrets } from "./Services/Security/secretMigration";
import { resetAffectionOnce } from './Services/AI/affectionReset';
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
  await migrateIntegrationSecrets();
  const affectionReset = await resetAffectionOnce();
  if (affectionReset.applied) console.log(`[Profile] reset affection for ${affectionReset.affectedProfiles} profile(s)`);
} else {
  console.warn('⚠️  NODB mode enabled, skipping MongoDB connection');
}

import {
  Client,
  GatewayIntentBits,
  Partials,
  Collection,
  ChannelType,
  Events,
  Message as DiscordMessage
} from "discord.js";

import { MyClient } from "./Model/client";
import { SessionScheduler } from "./Services/SessionScheduler";
import { ConnectionStateManager, ConnectionState } from "./Services/ConnectionStateManager";
import { handleAIChat, updateChannelCache } from "./Services/AI";
import { forgetCachedMessage } from './Services/AI/cache';
import { isIgnoring, loadSocialState, socialFeatureEnabled } from './Services/AI/socialState';
import { ConversationAttention } from './Services/AI/attention';
import { dispatchDiscordAction, guardDiscordActions } from './Services/AI/discordActions';
import { shouldRespondToMessage } from './Services/AI/routing';
import { observeDiscordEvent } from './Services/AI/observations';
import type { ChatMessage } from './Services/AI/discordAccess';
import { getLoopStatsSummary } from "./Services/AI/chat";
import { handleSpamDetection, handlePhishingDetection, handleImageScamDetection } from "./Services/Moderation";
import { shouldChimeIn } from "./Services/AI/spontaneous";
import { redactDiscordSecrets } from "./utils/redactSecrets";
import { memory } from './Services/AI/memory';
import { forgetVisionReferences } from './Services/AI/vision';


const {
  Guilds,
  GuildMembers,
  GuildMessages,
  GuildMessageReactions,
  GuildScheduledEvents,
  MessageContent,
  DirectMessages,
} = GatewayIntentBits;

const { User, Message, GuildMember, Channel } = Partials;

const client = new Client({
  intents: [Guilds, GuildMembers, GuildMessages, GuildMessageReactions, GuildScheduledEvents, MessageContent, DirectMessages],
  partials: [User, Message, GuildMember, Channel]
}) as MyClient;

// The bot intentionally registers several independent startup jobs on the
// ready event. Keep a bounded warning threshold above that known count; Bun's
// default MaxListeners warning serializes the Discord client (including its
// credential) into logs.
client.setMaxListeners(20);

client.events = new Collection();
client.commands = new Collection();
client.subCommands = new Collection();

const conversationAttention = new ConversationAttention({
  respond: (message, options) => handleAIChat(message, client, options),
  decide: (message, recent) => shouldChimeIn(message, client.user?.id, recent),
  react: (message, emoji, isCurrent) => { guardDiscordActions(message, isCurrent); return dispatchDiscordAction('react_to_message', { emoji }, message); },
  canRespond: async message => !socialFeatureEnabled('AI_ALLOW_IGNORING') || !isIgnoring(await loadSocialState(message.author.id), message.channelId),
});

async function addressedToHackerika(message: ChatMessage): Promise<boolean> {
  if (!message.guild || (client.user?.id && message.mentions.repliedUser?.id === client.user.id)) return true;
  const referenced = message.reference?.messageId
    ? message.channel.messages.cache.get(message.reference.messageId) || await message.channel.messages.fetch(message.reference.messageId).catch(() => null)
    : null;
  return shouldRespondToMessage(message, referenced, client.user?.id);
}

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
  const safeMessage = redactDiscordSecrets(message, TOKEN);
  // Only log important debug messages to reduce noise
  if (message.includes('READY')) {
    console.log('🔍 Gateway: READY received');
  } else if (message.includes('RESUMED')) {
    console.log('🔍 Gateway: RESUMED received');
  } else if (message.includes('Session Limit Information')) {
    console.log('🔍 Gateway:', safeMessage);
  } else if (message.includes('Heartbeat acknowledged')) {
    // Heartbeat is working - connection is healthy (don't log to reduce noise)
  } else if (message.includes('Session is invalid') || message.includes('Invalid session')) {
    console.log('⚠️  Gateway: Invalid session detected');
  } else if (message.includes('no session is available')) {
    // Suppress these messages - they occur during normal connection establishment
  } else {
    // Log any other debug messages that might be important
    console.log('🔍 Gateway:', safeMessage);
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

// Process-level safety nets — keep the bot alive on otherwise-fatal errors.
// Without these, a single throw inside any event handler / promise callback
// (e.g. discord.js' InteractionNotReplied) will bring the whole process down.
process.on('uncaughtException', (error, origin) => {
  console.error(`💥 uncaughtException (${origin}):`, error);
  connectionStateManager.setState(ConnectionState.ERROR, `uncaughtException: ${error.message}`);
});

process.on('unhandledRejection', (reason) => {
  console.error('💥 unhandledRejection:', reason);
});

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
    conversationAttention.dispose();
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
  console.log('   AI-loop: ' + getLoopStatsSummary());
}, 30 * 60 * 1000); // Log every 30 minutes

// Start login process with scheduler
console.log('🚀 Starting CTF Assistant Bot...');
loginWithScheduler();


client.on(Events.MessageCreate, async (message) => {
  conversationAttention.observe(message);
  // Cache + index EVERY message — including Hackerika's own replies and other
  // bots — so channel context covers the full multi-party conversation flow.
  // Only the AI / moderation paths skip bot-authored messages below.
  // Fire-and-forget but CATCH — a Mongo blip must not raise an unhandled
  // rejection on every message (2026-06-09 audit fix).
  void updateChannelCache(message as DiscordMessage).catch((e) =>
    console.error('[Cache] updateChannelCache failed:', e),
  )

  if (message.author.bot) return;

  // Check for spam first
  const isSpam = await handleSpamDetection(message);
  if (isSpam) { conversationAttention.remove(message.channelId, message.id); return; }

  // Perceptual image-scam check (catches re-encoded scam images that byte-hash
  // dedup misses, correlated across accounts/channels).
  const isImageScam = await handleImageScamDetection(message);
  if (isImageScam) { conversationAttention.remove(message.channelId, message.id); return; }

  // Check for phishing messages
  const isPhishing = await handlePhishingDetection(message);
  if (isPhishing) { conversationAttention.remove(message.channelId, message.id); return; }

  // Moderation still runs, but a social cooldown is real silence: no ambient
  // emoji, no AI request, and no spontaneous attempt to restart the chat.
  if (socialFeatureEnabled('AI_ALLOW_IGNORING') && isIgnoring(await loadSocialState(message.author.id), message.channelId)) return;

  conversationAttention.schedule(message, await addressedToHackerika(message));
});

client.on(Events.MessageDelete, message => {
  forgetVisionReferences(memory[message.channelId]?.messages || [], message.id);
  conversationAttention.remove(message.channelId, message.id);
  observeDiscordEvent(message.channelId, { kind: 'message_deleted', messageId: message.id });
  void forgetCachedMessage(message.channelId, message.id).catch(() => console.warn('[Cache] deleted-message cleanup failed'));
});

client.on(Events.MessageBulkDelete, messages => {
  for (const message of messages.values()) {
    forgetVisionReferences(memory[message.channelId]?.messages || [], message.id);
    conversationAttention.remove(message.channelId, message.id);
    void forgetCachedMessage(message.channelId, message.id).catch(() => undefined);
  }
});

client.on(Events.MessageUpdate, async (_old, updated) => {
  try {
    const message = updated.partial ? await updated.fetch() : updated;
    if (!message.author) return;
    forgetVisionReferences(memory[message.channelId]?.messages || [], message.id);
    conversationAttention.edit(message as ChatMessage, await addressedToHackerika(message as ChatMessage));
    observeDiscordEvent(message.channelId, { kind: 'message_edited', messageId: message.id, userId: message.author.id });
    await updateChannelCache(message);
  } catch { console.warn('[Attention] message edit unavailable'); }
});

client.on(Events.MessageReactionAdd, (reaction, user) => observeDiscordEvent(reaction.message.channelId,
  { kind: 'reaction_added', messageId: reaction.message.id, userId: user.id, detail: reaction.emoji.toString() }));
client.on(Events.MessageReactionRemove, (reaction, user) => observeDiscordEvent(reaction.message.channelId,
  { kind: 'reaction_removed', messageId: reaction.message.id, userId: user.id, detail: reaction.emoji.toString() }));

client.on(Events.ThreadCreate, thread => {
  observeDiscordEvent(thread.id, { kind: 'thread_created', detail: thread.name });
  if (thread.type !== ChannelType.PrivateThread && thread.parentId) observeDiscordEvent(thread.parentId, { kind: 'thread_created', detail: thread.name });
});
client.on(Events.GuildMemberAdd, member => observeDiscordEvent(`guild:${member.guild.id}`, { kind: 'member_joined', userId: member.id, detail: member.displayName }));
client.on(Events.GuildMemberRemove, member => observeDiscordEvent(`guild:${member.guild.id}`, { kind: 'member_left', userId: member.id, detail: member.displayName }));

export default client
