import { EventEmitter } from 'events';

export enum ConnectionState {
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  DISCONNECTED = 'DISCONNECTED',
  RECONNECTING = 'RECONNECTING',
  WAITING_FOR_RESET = 'WAITING_FOR_RESET',
  ERROR = 'ERROR'
}

export interface ConnectionEvent {
  state: ConnectionState;
  timestamp: Date;
  reason?: string;
  metadata?: Record<string, any>;
}

export interface ConnectionHealth {
  currentState: ConnectionState;
  uptime: number;
  lastStateChange: Date;
  disconnectionCount: number;
  reconnectionCount: number;
  averageConnectionDuration: number;
  isHealthy: boolean;
}

/**
 * Manages and tracks Discord bot connection state transitions
 */
export class ConnectionStateManager extends EventEmitter {
  private currentState: ConnectionState;
  private stateHistory: ConnectionEvent[] = [];
  private connectionStartTime: Date | null = null;
  private lastDisconnectTime: Date | null = null;
  private connectionDurations: number[] = [];
  private maxHistorySize: number = 100;

  constructor() {
    super();
    this.currentState = ConnectionState.DISCONNECTED;
    this.recordStateChange(ConnectionState.DISCONNECTED, 'Initial state');
  }

  /**
   * Transition to a new connection state
   */
  setState(newState: ConnectionState, reason?: string, metadata?: Record<string, any>): void {
    const previousState = this.currentState;
    
    if (previousState === newState && newState !== ConnectionState.ERROR) {
      // Skip duplicate state transitions (except ERROR which can repeat)
      return;
    }

    this.currentState = newState;
    this.recordStateChange(newState, reason, metadata);

    // Track connection timing
    if (newState === ConnectionState.CONNECTED) {
      this.connectionStartTime = new Date();
    } else if (previousState === ConnectionState.CONNECTED && this.connectionStartTime) {
      const duration = Date.now() - this.connectionStartTime.getTime();
      this.connectionDurations.push(duration);
      // Keep only last 50 durations
      if (this.connectionDurations.length > 50) {
        this.connectionDurations.shift();
      }
      this.connectionStartTime = null;
    }

    if (newState === ConnectionState.DISCONNECTED) {
      this.lastDisconnectTime = new Date();
    }

    // Emit state change event
    this.emit('stateChange', {
      from: previousState,
      to: newState,
      reason,
      metadata,
      timestamp: new Date()
    });

    console.log(`🔄 Connection state: ${previousState} → ${newState}${reason ? ` (${reason})` : ''}`);
  }

  /**
   * Get current connection state
   */
  getState(): ConnectionState {
    return this.currentState;
  }

  /**
   * Check if currently connected
   */
  isConnected(): boolean {
    return this.currentState === ConnectionState.CONNECTED;
  }

  /**
   * Check if in a transitional state
   */
  isTransitioning(): boolean {
    return this.currentState === ConnectionState.CONNECTING || 
           this.currentState === ConnectionState.RECONNECTING;
  }

  /**
   * Record a state change in history
   */
  private recordStateChange(state: ConnectionState, reason?: string, metadata?: Record<string, any>): void {
    const event: ConnectionEvent = {
      state,
      timestamp: new Date(),
      reason,
      metadata
    };

    this.stateHistory.push(event);

    // Maintain max history size
    if (this.stateHistory.length > this.maxHistorySize) {
      this.stateHistory.shift();
    }
  }

  /**
   * Get connection state history
   */
  getHistory(limit?: number): ConnectionEvent[] {
    if (limit) {
      return this.stateHistory.slice(-limit);
    }
    return [...this.stateHistory];
  }

  /**
   * Get comprehensive health metrics
   */
  getHealth(): ConnectionHealth {
    const now = Date.now();
    const uptime = this.connectionStartTime 
      ? now - this.connectionStartTime.getTime()
      : 0;

    const disconnectionCount = this.stateHistory.filter(
      e => e.state === ConnectionState.DISCONNECTED
    ).length;

    const reconnectionCount = this.stateHistory.filter(
      e => e.state === ConnectionState.RECONNECTING
    ).length;

    const averageConnectionDuration = this.connectionDurations.length > 0
      ? this.connectionDurations.reduce((a, b) => a + b, 0) / this.connectionDurations.length
      : 0;

    const lastEvent = this.stateHistory[this.stateHistory.length - 1];
    
    // Determine if connection is healthy
    const isHealthy = this.currentState === ConnectionState.CONNECTED &&
                     uptime > 60000 && // Connected for at least 1 minute
                     !this.hasRecentDisconnections(5, 5 * 60 * 1000); // Less than 5 disconnects in 5 minutes

    return {
      currentState: this.currentState,
      uptime,
      lastStateChange: lastEvent.timestamp,
      disconnectionCount,
      reconnectionCount,
      averageConnectionDuration,
      isHealthy
    };
  }

  /**
   * Detect abnormal disconnection patterns
   */
  hasRecentDisconnections(threshold: number, timeWindowMs: number): boolean {
    const cutoffTime = Date.now() - timeWindowMs;
    const recentDisconnects = this.stateHistory.filter(
      e => e.state === ConnectionState.DISCONNECTED && 
           e.timestamp.getTime() > cutoffTime
    );
    return recentDisconnects.length >= threshold;
  }

  /**
   * Check for rapid reconnection cycles
   */
  isReconnectLooping(threshold: number = 3, timeWindowMs: number = 60000): boolean {
    const cutoffTime = Date.now() - timeWindowMs;
    const recentReconnects = this.stateHistory.filter(
      e => e.state === ConnectionState.RECONNECTING && 
           e.timestamp.getTime() > cutoffTime
    );
    return recentReconnects.length >= threshold;
  }

  /**
   * Get time since last state change
   */
  getTimeSinceLastChange(): number {
    const lastEvent = this.stateHistory[this.stateHistory.length - 1];
    return Date.now() - lastEvent.timestamp.getTime();
  }

  /**
   * Reset connection statistics
   */
  reset(): void {
    this.connectionDurations = [];
    this.stateHistory = [];
    this.connectionStartTime = null;
    this.lastDisconnectTime = null;
    this.recordStateChange(this.currentState, 'Statistics reset');
  }

  /**
   * Get a summary for logging
   */
  getSummary(): string {
    const health = this.getHealth();
    const uptimeMin = Math.floor(health.uptime / 60000);
    const avgDurationMin = Math.floor(health.averageConnectionDuration / 60000);
    
    return `State: ${health.currentState}, Uptime: ${uptimeMin}m, ` +
           `Disconnects: ${health.disconnectionCount}, Reconnects: ${health.reconnectionCount}, ` +
           `Avg Duration: ${avgDurationMin}m, Healthy: ${health.isHealthy}`;
  }
}

