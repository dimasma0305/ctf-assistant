import { MyClient } from '../Model/client';
import { Events } from 'discord.js';

export interface BotMetrics {
  uptime: number;
  startTime: Date;
  totalReconnections: number;
  totalDisconnections: number;
  totalErrors: number;
  totalResumes: number;
  sessionUsage: number;
  lastReconnectionTime: Date | null;
  lastErrorTime: Date | null;
  eventCounts: Record<string, number>;
  averageLatency: number;
}

/**
 * Collects and tracks Discord bot metrics
 */
export class MetricsCollector {
  private client: MyClient;
  private startTime: Date;
  private totalReconnections: number = 0;
  private totalDisconnections: number = 0;
  private totalErrors: number = 0;
  private totalResumes: number = 0;
  private lastReconnectionTime: Date | null = null;
  private lastErrorTime: Date | null = null;
  private eventCounts: Map<string, number> = new Map();
  private latencySamples: number[] = [];
  private readonly maxLatencySamples = 100;

  constructor(client: MyClient) {
    this.client = client;
    this.startTime = new Date();
    this.setupEventTracking();
  }

  /**
   * Set up event tracking
   */
  private setupEventTracking(): void {
    // Track ready event
    this.client.on(Events.ClientReady, () => {
      this.incrementEvent('ready');
      console.log('📊 Metrics: Bot ready');
    });

    // Track resume event (session resumed without new IDENTIFY)
    this.client.on('resumed' as any, () => {
      this.totalResumes++;
      this.incrementEvent('resumed');
      console.log('📊 Metrics: Session resumed (no IDENTIFY used)');
    });

    // Track disconnect
    this.client.on('disconnect' as any, () => {
      this.totalDisconnections++;
      this.incrementEvent('disconnect');
      console.log('📊 Metrics: Disconnected');
    });

    // Track errors
    this.client.on('error', (error) => {
      this.totalErrors++;
      this.lastErrorTime = new Date();
      this.incrementEvent('error');
      
      // Track specific error types
      if (error.message?.includes('session_start_limit')) {
        this.incrementEvent('error_session_limit');
      } else if (error.message?.includes('ECONNRESET')) {
        this.incrementEvent('error_connection_reset');
      } else if (error.message?.includes('ETIMEDOUT')) {
        this.incrementEvent('error_timeout');
      }
    });

    // Track shard errors
    this.client.on(Events.ShardError, (error) => {
      this.incrementEvent('shard_error');
      console.error('📊 Metrics: Shard error occurred');
    });

    // Track important gateway events
    this.client.on(Events.Debug, (message) => {
      if (message.includes('READY')) {
        this.incrementEvent('gateway_ready');
      } else if (message.includes('RESUMED')) {
        this.totalResumes++;
        this.incrementEvent('gateway_resumed');
      } else if (message.includes('Session Limit Information')) {
        // Parse and track session limit info if available
        this.incrementEvent('session_limit_info');
      }
    });

    // Track reconnection
    this.client.on('reconnecting' as any, () => {
      this.totalReconnections++;
      this.lastReconnectionTime = new Date();
      this.incrementEvent('reconnecting');
      console.log('📊 Metrics: Reconnecting...');
    });

    // Track websocket ping for latency
    setInterval(() => {
      const ping = this.client.ws.ping;
      if (ping > 0) {
        this.recordLatency(ping);
      }
    }, 30000); // Every 30 seconds
  }

  /**
   * Increment event counter
   */
  private incrementEvent(eventName: string): void {
    const current = this.eventCounts.get(eventName) || 0;
    this.eventCounts.set(eventName, current + 1);
  }

  /**
   * Record latency sample
   */
  private recordLatency(latency: number): void {
    this.latencySamples.push(latency);
    if (this.latencySamples.length > this.maxLatencySamples) {
      this.latencySamples.shift();
    }
  }

  /**
   * Get all metrics
   */
  getMetrics(): BotMetrics {
    const uptime = Date.now() - this.startTime.getTime();
    const averageLatency = this.latencySamples.length > 0
      ? this.latencySamples.reduce((a, b) => a + b, 0) / this.latencySamples.length
      : 0;

    return {
      uptime,
      startTime: this.startTime,
      totalReconnections: this.totalReconnections,
      totalDisconnections: this.totalDisconnections,
      totalErrors: this.totalErrors,
      totalResumes: this.totalResumes,
      sessionUsage: this.client.sessionScheduler?.getSessionInfo()?.remainingSessions 
        ? 1000 - this.client.sessionScheduler.getSessionInfo()!.remainingSessions
        : 0,
      lastReconnectionTime: this.lastReconnectionTime,
      lastErrorTime: this.lastErrorTime,
      eventCounts: Object.fromEntries(this.eventCounts),
      averageLatency
    };
  }

  /**
   * Get metrics summary for logging
   */
  getSummary(): string {
    const metrics = this.getMetrics();
    const uptimeHours = (metrics.uptime / (1000 * 60 * 60)).toFixed(2);
    
    return `Uptime: ${uptimeHours}h, Reconnects: ${metrics.totalReconnections}, ` +
           `Resumes: ${metrics.totalResumes}, Errors: ${metrics.totalErrors}, ` +
           `Avg Latency: ${Math.floor(metrics.averageLatency)}ms`;
  }

  /**
   * Log current metrics
   */
  logMetrics(): void {
    const metrics = this.getMetrics();
    console.log('📊 === Bot Metrics ===');
    console.log(`   Uptime: ${(metrics.uptime / (1000 * 60 * 60)).toFixed(2)} hours`);
    console.log(`   Total Reconnections: ${metrics.totalReconnections}`);
    console.log(`   Total Resumes: ${metrics.totalResumes} (no IDENTIFY used)`);
    console.log(`   Total Disconnections: ${metrics.totalDisconnections}`);
    console.log(`   Total Errors: ${metrics.totalErrors}`);
    console.log(`   Average Latency: ${Math.floor(metrics.averageLatency)}ms`);
    console.log(`   Session Usage: ${metrics.sessionUsage}/1000`);
    
    if (Object.keys(metrics.eventCounts).length > 0) {
      console.log('   Event Counts:');
      Object.entries(metrics.eventCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .forEach(([event, count]) => {
          console.log(`     ${event}: ${count}`);
        });
    }
    console.log('📊 ====================');
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.startTime = new Date();
    this.totalReconnections = 0;
    this.totalDisconnections = 0;
    this.totalErrors = 0;
    this.totalResumes = 0;
    this.lastReconnectionTime = null;
    this.lastErrorTime = null;
    this.eventCounts.clear();
    this.latencySamples = [];
  }

  /**
   * Get event count for specific event
   */
  getEventCount(eventName: string): number {
    return this.eventCounts.get(eventName) || 0;
  }

  /**
   * Check if metrics indicate unhealthy state
   */
  isUnhealthy(): boolean {
    const metrics = this.getMetrics();
    const uptimeMinutes = metrics.uptime / (1000 * 60);
    
    // Consider unhealthy if:
    // - More than 10 reconnections per hour
    // - More than 5 errors in last hour
    // - Average latency over 1000ms
    
    if (uptimeMinutes > 60) {
      const reconnectsPerHour = (metrics.totalReconnections / uptimeMinutes) * 60;
      if (reconnectsPerHour > 10) return true;
      
      const errorsPerHour = (metrics.totalErrors / uptimeMinutes) * 60;
      if (errorsPerHour > 5) return true;
    }
    
    if (metrics.averageLatency > 1000) return true;
    
    return false;
  }
}

