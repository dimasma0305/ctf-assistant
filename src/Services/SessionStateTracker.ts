/**
 * SessionStateTracker - Manages session resume state without using global variables
 * Tracks whether the bot should attempt to resume sessions and the state of connections
 */
export class SessionStateTracker {
  private attemptedResume: boolean = false;
  private sessionCanBeResumed: boolean = false;
  private lastConnectionWasResume: boolean = false;
  private isGracefulShutdown: boolean = false;

  constructor() {
    // Initialize with clean state
    this.reset();
  }

  /**
   * Reset all state to initial values
   */
  reset(): void {
    this.attemptedResume = false;
    this.sessionCanBeResumed = false;
    this.lastConnectionWasResume = false;
    this.isGracefulShutdown = false;
  }

  /**
   * Mark that a RESUME attempt is in progress
   */
  markResumeAttempt(): void {
    this.attemptedResume = true;
  }

  /**
   * Check if a RESUME attempt was made
   */
  hasAttemptedResume(): boolean {
    return this.attemptedResume;
  }

  /**
   * Mark that a RESUME succeeded
   */
  markResumeSuccess(): void {
    this.attemptedResume = false;
    this.lastConnectionWasResume = true;
    this.sessionCanBeResumed = true;
  }

  /**
   * Mark that a RESUME failed
   */
  markResumeFailed(): void {
    this.attemptedResume = false;
    this.lastConnectionWasResume = false;
    this.sessionCanBeResumed = false;
  }

  /**
   * Mark that an IDENTIFY succeeded (not a RESUME)
   */
  markIdentifySuccess(): void {
    this.attemptedResume = false;
    this.lastConnectionWasResume = false;
    this.sessionCanBeResumed = true; // Session is immediately resumable (will be saved to DB)
  }

  /**
   * Check if the session can be resumed
   */
  canResumeSession(): boolean {
    return this.sessionCanBeResumed;
  }

  /**
   * Check if last connection was via RESUME
   */
  wasLastConnectionResume(): boolean {
    return this.lastConnectionWasResume;
  }

  /**
   * Mark that a graceful shutdown is in progress
   */
  markGracefulShutdown(): void {
    this.isGracefulShutdown = true;
  }

  /**
   * Check if shutdown is graceful
   */
  isShutdownGraceful(): boolean {
    return this.isGracefulShutdown;
  }

  /**
   * Mark that session is no longer resumable (e.g., after disconnect)
   */
  markSessionInvalid(): void {
    this.sessionCanBeResumed = false;
    this.lastConnectionWasResume = false;
  }

  /**
   * Get current state for debugging
   */
  getState(): {
    attemptedResume: boolean;
    sessionCanBeResumed: boolean;
    lastConnectionWasResume: boolean;
    isGracefulShutdown: boolean;
  } {
    return {
      attemptedResume: this.attemptedResume,
      sessionCanBeResumed: this.sessionCanBeResumed,
      lastConnectionWasResume: this.lastConnectionWasResume,
      isGracefulShutdown: this.isGracefulShutdown,
    };
  }

  /**
   * Cleanup on destroy
   */
  destroy(): void {
    // Cleanup any resources
    this.reset();
  }
}

