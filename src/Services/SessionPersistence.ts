import { MyClient } from '../Model/client';
import { SessionStateModel } from '../Database/connect';

export interface PersistedSessionData {
  sessionId: string;
  sequence: number;
  resumeURL: string;
  shardId: number;
  savedAt: Date;
  expiresAt: Date;
}

/**
 * Manages Discord session persistence across bot restarts
 * Allows RESUME instead of IDENTIFY when restarting within the resume window
 */
export class SessionPersistence {
  private client: MyClient;
  private sessionData: PersistedSessionData | null = null;
  private readonly resumeTimeoutMs: number = 5 * 60 * 1000; // Discord allows ~5 minutes for RESUME
  private autoSaveInterval: ReturnType<typeof setInterval> | null = null;

  constructor(client: MyClient) {
    this.client = client;
  }

  /**
   * Initialize and load any saved session data
   */
  async initialize(): Promise<void> {
    try {
      await this.loadSessionData();
      
      if (this.sessionData) {
        const now = new Date();
        if (now < this.sessionData.expiresAt) {
          console.log('✅ Found valid saved session data');
          console.log(`   Session ID: ${this.sessionData.sessionId.substring(0, 20)}...`);
          console.log(`   Sequence: ${this.sessionData.sequence}`);
          console.log(`   Expires: ${this.sessionData.expiresAt.toISOString()}`);
          console.log('   Will attempt RESUME on connection');
        } else {
          console.log('⏰ Saved session has expired, will use fresh IDENTIFY');
          await this.clearSessionData();
        }
      } else {
        console.log('ℹ️  No saved session data found, will use fresh IDENTIFY');
      }
    } catch (error) {
      console.error('⚠️  Failed to load session data:', error);
    }
  }

  /**
   * Start capturing and auto-saving session data
   */
  startCapture(): void {
    // Capture session data when connected
    this.client.once('ready', () => {
      this.captureSessionData();
      this.setupAutoSave();
      this.setupEventHandlers();
    });

    console.log('🔍 Session capture initialized');
  }

  /**
   * Capture current session data from the WebSocket
   */
  private captureSessionData(): void {
    try {
      const ws = this.client.ws;
      
      // Access internal WebSocket manager data
      // @ts-ignore - accessing internal Discord.js properties
      const shards = ws.shards;
      
      if (shards.size > 0) {
        const shard = shards.first();
        
        // @ts-ignore - accessing internal shard properties
        const sessionId = shard?.sessionId;
        // @ts-ignore
        const sequence = shard?.sequence || 0;
        // @ts-ignore
        const resumeURL = shard?.resumeURL || ws.gateway;

        if (sessionId) {
          this.sessionData = {
            sessionId,
            sequence,
            resumeURL,
            shardId: 0,
            savedAt: new Date(),
            expiresAt: new Date(Date.now() + this.resumeTimeoutMs)
          };

          console.log('📦 Captured session data:');
          console.log(`   Session ID: ${sessionId.substring(0, 20)}...`);
          console.log(`   Sequence: ${sequence}`);
          console.log(`   Resume URL: ${resumeURL}`);
          
          // Save immediately
          this.saveSessionData();
        } else {
          console.warn('⚠️  Could not capture session ID');
        }
      }
    } catch (error) {
      console.error('❌ Failed to capture session data:', error);
    }
  }

  /**
   * Setup auto-save to periodically save session data
   */
  private setupAutoSave(): void {
    // Auto-save every 30 seconds to keep sequence number updated
    this.autoSaveInterval = setInterval(() => {
      this.captureSessionData();
    }, 30000);

    console.log('💾 Auto-save enabled (every 30s)');
  }

  /**
   * Setup event handlers to save session data on important events
   */
  private setupEventHandlers(): void {
    // Save on resume (session is still valid)
    this.client.on('resumed' as any, () => {
      console.log('📦 Session resumed, updating saved data');
      this.captureSessionData();
    });

    // Update sequence on any significant event
    this.client.on('messageCreate', () => {
      // Throttled update - only if enough time has passed
      if (this.sessionData) {
        const timeSinceLastSave = Date.now() - this.sessionData.savedAt.getTime();
        if (timeSinceLastSave > 60000) { // Update every minute at most
          this.captureSessionData();
        }
      }
    });
  }

  /**
   * Stop auto-save and capture
   */
  stopCapture(): void {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
      this.autoSaveInterval = null;
    }
  }

  /**
   * Save session data to database
   */
  private async saveSessionData(): Promise<void> {
    if (!this.sessionData) return;

    try {
      await SessionStateModel.findOneAndUpdate(
        { _id: 'session_state' },
        {
          $set: {
            persistedSession: {
              sessionId: this.sessionData.sessionId,
              sequence: this.sessionData.sequence,
              resumeURL: this.sessionData.resumeURL,
              shardId: this.sessionData.shardId,
              savedAt: this.sessionData.savedAt,
              expiresAt: this.sessionData.expiresAt
            }
          }
        },
        { upsert: true }
      );
    } catch (error) {
      console.error('Failed to save session data to database:', error);
    }
  }

  /**
   * Load session data from database
   */
  private async loadSessionData(): Promise<void> {
    try {
      const state = await SessionStateModel.findById('session_state');
      
      if (state && state.persistedSession) {
        const session = state.persistedSession;
        
        this.sessionData = {
          sessionId: session.sessionId,
          sequence: session.sequence || 0,
          resumeURL: session.resumeURL,
          shardId: session.shardId || 0,
          savedAt: new Date(session.savedAt),
          expiresAt: new Date(session.expiresAt)
        };
      }
    } catch (error) {
      console.error('Failed to load session data from database:', error);
    }
  }

  /**
   * Clear saved session data
   */
  async clearSessionData(): Promise<void> {
    this.sessionData = null;
    
    try {
      await SessionStateModel.findOneAndUpdate(
        { _id: 'session_state' },
        { $unset: { persistedSession: '' } }
      );
    } catch (error) {
      console.error('Failed to clear session data from database:', error);
    }
  }

  /**
   * Get saved session data for RESUME attempt
   */
  getSavedSession(): PersistedSessionData | null {
    if (!this.sessionData) return null;
    
    const now = new Date();
    if (now >= this.sessionData.expiresAt) {
      console.log('⏰ Saved session has expired');
      return null;
    }
    
    return this.sessionData;
  }

  /**
   * Check if we have a valid session to resume
   */
  hasValidSession(): boolean {
    const session = this.getSavedSession();
    return session !== null;
  }

  /**
   * Attempt to inject saved session data into Discord.js for RESUME
   * This is called BEFORE client.login() to allow Discord.js to RESUME
   */
  async attemptSessionResume(): Promise<boolean> {
    const session = this.getSavedSession();
    
    if (!session) {
      console.log('ℹ️  No valid session to resume');
      return false;
    }

    try {
      console.log('🔄 Attempting to restore session for RESUME...');
      console.log(`   Session ID: ${session.sessionId.substring(0, 20)}...`);
      console.log(`   Sequence: ${session.sequence}`);
      
      // Access WebSocket manager
      const ws = this.client.ws;
      
      // Set session info before connection
      // @ts-ignore - accessing internal Discord.js properties
      if (ws.shards) {
        // @ts-ignore
        ws.shards.forEach((shard: any) => {
          shard.sessionId = session.sessionId;
          shard.sequence = session.sequence;
          shard.resumeURL = session.resumeURL;
        });
        
        console.log('✅ Session data injected, Discord.js will attempt RESUME');
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('❌ Failed to inject session data:', error);
      return false;
    }
  }

  /**
   * Save session data before shutdown (called in graceful shutdown)
   */
  async saveBeforeShutdown(): Promise<void> {
    console.log('💾 Saving session data before shutdown...');
    
    // Capture latest session data
    this.captureSessionData();
    
    // Stop auto-save
    this.stopCapture();
    
    console.log('✅ Session data saved for next restart');
  }

  /**
   * Get session status for logging
   */
  getStatus(): {
    hasSession: boolean;
    isExpired: boolean;
    sessionId?: string;
    sequence?: number;
    expiresAt?: string;
    timeUntilExpiry?: number;
  } {
    if (!this.sessionData) {
      return { hasSession: false, isExpired: false };
    }

    const now = Date.now();
    const isExpired = now >= this.sessionData.expiresAt.getTime();
    const timeUntilExpiry = this.sessionData.expiresAt.getTime() - now;

    return {
      hasSession: true,
      isExpired,
      sessionId: this.sessionData.sessionId.substring(0, 20) + '...',
      sequence: this.sessionData.sequence,
      expiresAt: this.sessionData.expiresAt.toISOString(),
      timeUntilExpiry: isExpired ? 0 : timeUntilExpiry
    };
  }
}

