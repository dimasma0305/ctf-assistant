import cron from 'node-cron';
import { MyClient } from '../Model/client';
import { SessionStateModel } from '../Database/connect';

interface SessionLimitInfo {
  resetTime: Date;
  remainingSessions: number;
  totalSessions: number;
}


interface SessionSchedulerStatus {
  isWaitingForReset: boolean;
  sessionInfo: SessionLimitInfo | null;
  hasScheduledTask: boolean;
  nextResetTime?: string;
}

export class SessionScheduler {
  private client: MyClient;
  private currentTask: ReturnType<typeof cron.schedule> | null = null;
  private sessionInfo: SessionLimitInfo | null = null;
  private isWaitingForReset: boolean = false;
  
  // Session budget tracking
  private identifyCallsToday: number = 0;
  private resumeCallsToday: number = 0;
  private sessionResetTime: Date | null = null;
  private readonly sessionBudget: number = 1000; // Discord's default limit
  private readonly warningThreshold: number = 0.8; // Warn at 80%
  private readonly criticalThreshold: number = 0.95; // Critical at 95%

  constructor(client: MyClient) {
    this.client = client;
    this.initializeState();
  }

  /**
   * Initialize scheduler state from persistent storage
   */
  private async initializeState(): Promise<void> {
    try {
      await this.loadState();
      
      // Check if we have a saved session limit that might still be active
      if (this.sessionInfo && this.isWaitingForReset) {
        const now = new Date();
        const resetTime = new Date(this.sessionInfo.resetTime);
        
        if (resetTime > now) {
          console.log('🔄 Restored session scheduler state from MongoDB');
          console.log(`⏰ Session limit still active, resuming scheduled reconnection at ${resetTime.toISOString()}`);
          this.scheduleReconnection(this.sessionInfo);
        } else {
          console.log('⏰ Saved session limit has expired, clearing state');
          this.clearState();
        }
      }
    } catch (error) {
      console.log('ℹ️  No previous session state found or failed to load, starting fresh');
    }
  }

  /**
   * Save current state to persistent storage
   */
  private async saveState(): Promise<void> {
    try {
      const state = {
        _id: 'session_state',
        sessionInfo: this.sessionInfo,
        isWaitingForReset: this.isWaitingForReset,
        savedAt: new Date()
      };

      await SessionStateModel.findOneAndUpdate(
        { _id: 'session_state' },
        state,
        { upsert: true, new: true }
      );
    } catch (error) {
      console.error('Failed to save session state to MongoDB:', error);
    }
  }

  /**
   * Load state from persistent storage
   */
  private async loadState(): Promise<void> {
    try {
      const state = await SessionStateModel.findById('session_state');
      
      if (state && state.sessionInfo && state.sessionInfo.resetTime) {
        // Convert resetTime back to Date if needed
        this.sessionInfo = {
          resetTime: new Date(state.sessionInfo.resetTime),
          remainingSessions: state.sessionInfo.remainingSessions || 0,
          totalSessions: state.sessionInfo.totalSessions || 1000
        };
        this.isWaitingForReset = state.isWaitingForReset || false;
      }
    } catch (error) {
      throw new Error(`Failed to load state from MongoDB: ${error}`);
    }
  }

  /**
   * Clear persistent state
   */
  private async clearState(): Promise<void> {
    try {
      await SessionStateModel.deleteOne({ _id: 'session_state' });
    } catch (error) {
      console.error('Failed to clear session state from MongoDB:', error);
    }
    this.sessionInfo = null;
    this.isWaitingForReset = false;
  }

  /**
   * Parse session limit information from Discord API error
   */
  parseSessionLimitError(errorMessage: string): SessionLimitInfo | null {
    try {
      // Extract reset time from error message
      const resetMatch = errorMessage.match(/resets at ([\d-T:.Z]+)/);
      // Extract remaining sessions from error message  
      const remainingMatch = errorMessage.match(/only (\d+) remaining/);
      // Extract total sessions from error message
      const totalMatch = errorMessage.match(/spawn (\d+) shards/);

      if (!resetMatch) return null;

      const resetTime = new Date(resetMatch[1]);
      const remainingSessions = remainingMatch ? parseInt(remainingMatch[1]) : 0;
      const totalSessions = totalMatch ? parseInt(totalMatch[1]) : 1000; // Discord default

      return {
        resetTime,
        remainingSessions,
        totalSessions
      };
    } catch (error) {
      console.error('Failed to parse session limit error:', error);
      return null;
    }
  }

  /**
   * Schedule bot reconnection when session limit resets
   */
  async scheduleReconnection(sessionInfo: SessionLimitInfo): Promise<void> {
    if (this.currentTask) {
      this.currentTask.stop();
      this.currentTask = null;
    }

    this.sessionInfo = sessionInfo;
    this.isWaitingForReset = true;
    
    // Save state to persistence
    await this.saveState();

    const now = new Date();
    const waitTime = sessionInfo.resetTime.getTime() - now.getTime();
    
    if (waitTime <= 0) {
      console.log('Session limit should have already reset, attempting immediate reconnection...');
      this.attemptReconnection();
      return;
    }

    const hours = Math.floor(waitTime / (1000 * 60 * 60));
    const minutes = Math.floor((waitTime % (1000 * 60 * 60)) / (1000 * 60));

    console.log(`📅 Session limit reached. Scheduled reconnection in ${hours}h ${minutes}m at ${sessionInfo.resetTime.toISOString()}`);
    console.log(`ℹ️  Remaining sessions: ${sessionInfo.remainingSessions}/${sessionInfo.totalSessions}`);

    // Create a cron job to run at the exact reset time
    const cronExpression = this.dateToCronExpression(sessionInfo.resetTime);
    
    try {
      this.currentTask = cron.schedule(cronExpression, async () => {
        console.log('🔄 Session limit reset time reached, attempting reconnection...');
        await this.attemptReconnection();
      }, {
        scheduled: true,
        timezone: 'UTC'
      });
      
      console.log(`⏰ Cron scheduled: ${cronExpression} (UTC)`);
    } catch (error) {
      console.error('Failed to schedule cron task, falling back to setTimeout:', error);
      // Fallback to setTimeout if cron fails
      setTimeout(async () => {
        console.log('🔄 Session limit reset time reached (setTimeout fallback), attempting reconnection...');
        await this.attemptReconnection();
      }, waitTime);
    }
  }

  /**
   * Convert Date to cron expression
   */
  private dateToCronExpression(date: Date): string {
    const utcDate = new Date(date.getTime());
    const minute = utcDate.getUTCMinutes();
    const hour = utcDate.getUTCHours();
    const day = utcDate.getUTCDate();
    const month = utcDate.getUTCMonth() + 1; // getUTCMonth() returns 0-11

    // Format: "minute hour day month *"
    return `${minute} ${hour} ${day} ${month} *`;
  }

  /**
   * Attempt to reconnect the bot
   */
  private async attemptReconnection(): Promise<void> {
    try {
      console.log('🚀 Attempting to reconnect Discord client...');
      
      // Clean up current task
      if (this.currentTask) {
        this.currentTask.stop();
        this.currentTask = null;
      }

      // Reset waiting state
      this.isWaitingForReset = false;
      
      // Clear persistent state since we're attempting reconnection
      await this.clearState();

      // Destroy current client connection if exists
      if (this.client.isReady()) {
        console.log('📴 Destroying current client connection...');
        this.client.destroy();
      }

      // Wait a moment for cleanup
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Attempt login
      console.log('🔐 Logging in to Discord...');
      await this.client.login(process.env.TOKEN);
      console.log('✅ Successfully reconnected to Discord!');
      
    } catch (error: any) {
      console.error('❌ Failed to reconnect:', error.message);
      
      // Check if it's still a session limit error
      if (error.message?.includes('sessions remaining')) {
        const newSessionInfo = this.parseSessionLimitError(error.message);
        if (newSessionInfo) {
          console.log('🔁 Session limit still active, rescheduling...');
          this.scheduleReconnection(newSessionInfo);
        }
      } else {
        // For other errors, retry after a delay
        console.log('⏳ Retrying reconnection in 5 minutes...');
        setTimeout(() => this.attemptReconnection(), 5 * 60 * 1000);
      }
    }
  }

  /**
   * Handle session limit error and schedule reconnection
   */
  async handleSessionLimitError(error: Error): Promise<boolean> {
    const sessionInfo = this.parseSessionLimitError(error.message);
    
    if (!sessionInfo) {
      console.log('⚠️  Could not parse session limit information from error');
      return false;
    }

    await this.scheduleReconnection(sessionInfo);
    return true;
  }

  /**
   * Get current session information
   */
  getSessionInfo(): SessionLimitInfo | null {
    return this.sessionInfo;
  }

  /**
   * Check if currently waiting for session reset
   */
  isWaitingForSessionReset(): boolean {
    return this.isWaitingForReset;
  }

  /**
   * Cancel current scheduled task
   */
  async cancelScheduledReconnection(): Promise<void> {
    if (this.currentTask) {
      console.log('🛑 Cancelling scheduled reconnection');
      this.currentTask.stop();
      this.currentTask = null;
    }
    this.isWaitingForReset = false;
    
    // Clear persistent state
    await this.clearState();
  }

  /**
   * Get status information for logging/monitoring
   */
  getStatus(): SessionSchedulerStatus {
    return {
      isWaitingForReset: this.isWaitingForReset,
      sessionInfo: this.sessionInfo,
      hasScheduledTask: !!this.currentTask,
      nextResetTime: this.sessionInfo?.resetTime?.toISOString()
    };
  }

  /**
   * Record an IDENTIFY call (uses a session)
   */
  recordIdentify(): void {
    this.identifyCallsToday++;
    this.checkSessionBudget();
    this.saveSessionMetrics();
  }

  /**
   * Record a RESUME call (doesn't use a session)
   */
  recordResume(): void {
    this.resumeCallsToday++;
    console.log('✅ Session RESUMED (no IDENTIFY used)');
    this.saveSessionMetrics();
  }

  /**
   * Check session budget and warn if approaching limit
   */
  private checkSessionBudget(): void {
    const usage = this.identifyCallsToday / this.sessionBudget;
    
    if (usage >= this.criticalThreshold) {
      console.error(`🚨 CRITICAL: Session budget at ${(usage * 100).toFixed(1)}% (${this.identifyCallsToday}/${this.sessionBudget})`);
    } else if (usage >= this.warningThreshold) {
      console.warn(`⚠️  WARNING: Session budget at ${(usage * 100).toFixed(1)}% (${this.identifyCallsToday}/${this.sessionBudget})`);
    }
  }

  /**
   * Get current session usage stats
   */
  getSessionUsage(): {
    identifyCalls: number;
    resumeCalls: number;
    budget: number;
    remaining: number;
    usagePercent: number;
  } {
    return {
      identifyCalls: this.identifyCallsToday,
      resumeCalls: this.resumeCallsToday,
      budget: this.sessionBudget,
      remaining: this.sessionBudget - this.identifyCallsToday,
      usagePercent: (this.identifyCallsToday / this.sessionBudget) * 100
    };
  }

  /**
   * Save session metrics to database
   */
  private async saveSessionMetrics(): Promise<void> {
    try {
      await SessionStateModel.findOneAndUpdate(
        { _id: 'session_state' },
        {
          $set: {
            'metrics.totalIdentifyCalls': this.identifyCallsToday,
            'metrics.totalResumeCalls': this.resumeCallsToday,
            'metrics.lastIdentifyTime': new Date()
          }
        },
        { upsert: true }
      );
    } catch (error) {
      console.error('Failed to save session metrics:', error);
    }
  }

  /**
   * Reset daily session counters (called when 24h window resets)
   */
  resetSessionCounters(): void {
    console.log(`📊 Resetting session counters. Previous: ${this.identifyCallsToday} IDENTIFY, ${this.resumeCallsToday} RESUME`);
    this.identifyCallsToday = 0;
    this.resumeCallsToday = 0;
    this.sessionResetTime = new Date();
  }
}
