/**
 * Manages Discord session rate limits and prevents excessive IDENTIFY calls
 */
export class RateLimitManager {
  private identifyCalls: { timestamp: Date; success: boolean }[] = [];
  private readonly maxIdentifyPer24h: number = 1000; // Discord default
  private readonly windowMs: number = 24 * 60 * 60 * 1000; // 24 hours
  private readonly warningThreshold: number = 0.8; // Warn at 80% usage
  private readonly criticalThreshold: number = 0.95; // Critical at 95% usage
  
  // Circuit breaker state
  private failedAttempts: number = 0;
  private readonly maxFailedAttempts: number = 5;
  private circuitBreakerOpenUntil: Date | null = null;
  private readonly circuitBreakerTimeout: number = 5 * 60 * 1000; // 5 minutes
  
  // Cooldown between attempts
  private lastAttemptTime: Date | null = null;
  private readonly minCooldownMs: number = 5000; // 5 seconds minimum between attempts

  constructor(maxIdentifyPer24h?: number) {
    if (maxIdentifyPer24h) {
      this.maxIdentifyPer24h = maxIdentifyPer24h;
    }
  }

  /**
   * Record an IDENTIFY call attempt
   */
  recordIdentify(success: boolean): void {
    const now = new Date();
    this.identifyCalls.push({ timestamp: now, success });
    this.lastAttemptTime = now;

    if (success) {
      this.failedAttempts = 0;
      this.circuitBreakerOpenUntil = null;
    } else {
      this.failedAttempts++;
      
      // Open circuit breaker after too many failures
      if (this.failedAttempts >= this.maxFailedAttempts) {
        this.circuitBreakerOpenUntil = new Date(now.getTime() + this.circuitBreakerTimeout);
        console.warn(`⚠️  Circuit breaker opened after ${this.failedAttempts} failed attempts. Will retry after ${new Date(this.circuitBreakerOpenUntil).toISOString()}`);
      }
    }

    // Clean up old entries outside the 24h window
    this.cleanupOldEntries();
    
    // Check and warn about usage
    this.checkUsageThresholds();
  }

  /**
   * Check if we can attempt a connection
   */
  canAttemptConnection(): { allowed: boolean; reason?: string; waitTimeMs?: number } {
    const now = new Date();

    // Check circuit breaker
    if (this.circuitBreakerOpenUntil && now < this.circuitBreakerOpenUntil) {
      const waitTime = this.circuitBreakerOpenUntil.getTime() - now.getTime();
      return {
        allowed: false,
        reason: 'Circuit breaker is open',
        waitTimeMs: waitTime
      };
    }

    // Reset circuit breaker if timeout has passed
    if (this.circuitBreakerOpenUntil && now >= this.circuitBreakerOpenUntil) {
      console.log('✅ Circuit breaker closed, resetting failed attempts counter');
      this.circuitBreakerOpenUntil = null;
      this.failedAttempts = 0;
    }

    // Check minimum cooldown between attempts
    if (this.lastAttemptTime) {
      const timeSinceLastAttempt = now.getTime() - this.lastAttemptTime.getTime();
      if (timeSinceLastAttempt < this.minCooldownMs) {
        const waitTime = this.minCooldownMs - timeSinceLastAttempt;
        return {
          allowed: false,
          reason: 'Minimum cooldown not met',
          waitTimeMs: waitTime
        };
      }
    }

    // Check session limit
    const usage = this.getCurrentUsage();
    if (usage >= this.maxIdentifyPer24h) {
      return {
        allowed: false,
        reason: 'Session limit reached for 24h window',
        waitTimeMs: this.getTimeUntilOldestExpires()
      };
    }

    return { allowed: true };
  }

  /**
   * Get current IDENTIFY usage in the 24h window
   */
  getCurrentUsage(): number {
    this.cleanupOldEntries();
    return this.identifyCalls.length;
  }

  /**
   * Get usage percentage
   */
  getUsagePercentage(): number {
    return (this.getCurrentUsage() / this.maxIdentifyPer24h) * 100;
  }

  /**
   * Get remaining IDENTIFY calls
   */
  getRemainingCalls(): number {
    return Math.max(0, this.maxIdentifyPer24h - this.getCurrentUsage());
  }

  /**
   * Check usage thresholds and log warnings
   */
  private checkUsageThresholds(): void {
    const usage = this.getCurrentUsage();
    const percentage = (usage / this.maxIdentifyPer24h);

    if (percentage >= this.criticalThreshold) {
      console.error(`🚨 CRITICAL: Session usage at ${(percentage * 100).toFixed(1)}% (${usage}/${this.maxIdentifyPer24h})`);
    } else if (percentage >= this.warningThreshold) {
      console.warn(`⚠️  WARNING: Session usage at ${(percentage * 100).toFixed(1)}% (${usage}/${this.maxIdentifyPer24h})`);
    }
  }

  /**
   * Clean up entries older than 24 hours
   */
  private cleanupOldEntries(): void {
    const cutoffTime = Date.now() - this.windowMs;
    this.identifyCalls = this.identifyCalls.filter(
      call => call.timestamp.getTime() > cutoffTime
    );
  }

  /**
   * Get time until oldest entry expires
   */
  private getTimeUntilOldestExpires(): number {
    if (this.identifyCalls.length === 0) return 0;
    
    const oldest = this.identifyCalls[0];
    const expiryTime = oldest.timestamp.getTime() + this.windowMs;
    return Math.max(0, expiryTime - Date.now());
  }

  /**
   * Get recommended wait time before next attempt
   */
  getRecommendedWaitTime(): number {
    const check = this.canAttemptConnection();
    if (check.allowed) {
      return 0;
    }
    return check.waitTimeMs || this.minCooldownMs;
  }

  /**
   * Get time until circuit breaker closes
   */
  getCircuitBreakerTimeRemaining(): number {
    if (!this.circuitBreakerOpenUntil) return 0;
    return Math.max(0, this.circuitBreakerOpenUntil.getTime() - Date.now());
  }

  /**
   * Check if circuit breaker is open
   */
  isCircuitBreakerOpen(): boolean {
    if (!this.circuitBreakerOpenUntil) return false;
    return new Date() < this.circuitBreakerOpenUntil;
  }

  /**
   * Manually reset circuit breaker (use with caution)
   */
  resetCircuitBreaker(): void {
    this.circuitBreakerOpenUntil = null;
    this.failedAttempts = 0;
    console.log('🔓 Circuit breaker manually reset');
  }

  /**
   * Get status summary
   */
  getStatus() {
    return {
      usage: this.getCurrentUsage(),
      limit: this.maxIdentifyPer24h,
      remaining: this.getRemainingCalls(),
      usagePercentage: this.getUsagePercentage().toFixed(1) + '%',
      failedAttempts: this.failedAttempts,
      circuitBreakerOpen: this.isCircuitBreakerOpen(),
      circuitBreakerTimeRemaining: this.getCircuitBreakerTimeRemaining(),
      canAttempt: this.canAttemptConnection().allowed
    };
  }

  /**
   * Generate a random jitter (2-5 seconds) to prevent thundering herd
   */
  static generateJitter(): number {
    return 2000 + Math.random() * 3000; // 2-5 seconds
  }
}

