import { EventEmitter } from 'events';
import { MyClient } from '../Model/client';

export interface HealthMetrics {
  wsHeartbeat: {
    lastHeartbeat: Date | null;
    lastAck: Date | null;
    latency: number;
    missedAcks: number;
  };
  apiLatency: {
    current: number;
    average: number;
    samples: number[];
  };
  eventActivity: {
    lastEvent: Date | null;
    eventsPerMinute: number;
  };
  overallHealth: 'healthy' | 'degraded' | 'unhealthy';
  issues: string[];
}

/**
 * Monitors Discord bot connection health and detects issues
 */
export class HealthMonitor extends EventEmitter {
  private client: MyClient;
  private lastHeartbeat: Date | null = null;
  private lastHeartbeatAck: Date | null = null;
  private lastEventTime: Date | null = null;
  private missedHeartbeatAcks: number = 0;
  private latencySamples: number[] = [];
  private eventTimestamps: Date[] = [];
  private healthCheckInterval: ReturnType<typeof setInterval> | null = null;
  private readonly maxLatencySamples: number = 30;
  private readonly maxEventTimestamps: number = 100;
  
  // Health thresholds
  private readonly heartbeatTimeoutMs: number = 45000; // 45 seconds
  private readonly maxMissedHeartbeats: number = 3;
  private readonly zombieConnectionTimeoutMs: number = 5 * 60 * 1000; // 5 minutes without events
  private readonly healthCheckIntervalMs: number = 30000; // Check every 30 seconds

  constructor(client: MyClient) {
    super();
    this.client = client;
  }

  /**
   * Start monitoring
   */
  start(): void {
    if (this.healthCheckInterval) {
      return; // Already started
    }

    console.log('🏥 Health monitor started');

    // Set up Discord.js event listeners
    this.setupEventListeners();

    // Periodic health checks
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, this.healthCheckIntervalMs);
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    console.log('🏥 Health monitor stopped');
  }

  /**
   * Set up Discord.js event listeners
   */
  private setupEventListeners(): void {
    // Track websocket heartbeats
    this.client.ws.on('HEARTBEAT' as any, () => {
      this.lastHeartbeat = new Date();
      this.recordEvent('heartbeat');
    });

    this.client.ws.on('HEARTBEAT_ACK' as any, () => {
      this.lastHeartbeatAck = new Date();
      this.missedHeartbeatAcks = 0;
      
      // Record latency (ping)
      const latency = this.client.ws.ping;
      if (latency > 0) {
        this.recordLatency(latency);
      }
      
      this.recordEvent('heartbeat_ack');
    });

    // Track general events to detect zombie connections
    this.client.on('messageCreate' as any, () => this.recordEvent('message'));
    this.client.on('ready' as any, () => this.recordEvent('ready'));
    this.client.on('guildCreate' as any, () => this.recordEvent('guild'));
  }

  /**
   * Record an event occurrence
   */
  private recordEvent(type: string): void {
    this.lastEventTime = new Date();
    this.eventTimestamps.push(new Date());
    
    // Keep only recent timestamps
    if (this.eventTimestamps.length > this.maxEventTimestamps) {
      this.eventTimestamps.shift();
    }
  }

  /**
   * Record API latency
   */
  private recordLatency(latency: number): void {
    this.latencySamples.push(latency);
    
    // Keep only recent samples
    if (this.latencySamples.length > this.maxLatencySamples) {
      this.latencySamples.shift();
    }
  }

  /**
   * Calculate events per minute
   */
  private calculateEventsPerMinute(): number {
    const oneMinuteAgo = Date.now() - 60000;
    const recentEvents = this.eventTimestamps.filter(
      timestamp => timestamp.getTime() > oneMinuteAgo
    );
    return recentEvents.length;
  }

  /**
   * Perform comprehensive health check
   */
  private performHealthCheck(): void {
    const metrics = this.getMetrics();
    const issues: string[] = [];

    // Check heartbeat health
    if (this.lastHeartbeat) {
      const timeSinceHeartbeat = Date.now() - this.lastHeartbeat.getTime();
      if (timeSinceHeartbeat > this.heartbeatTimeoutMs) {
        issues.push(`No heartbeat for ${Math.floor(timeSinceHeartbeat / 1000)}s`);
      }
    }

    // Check for missed heartbeat acknowledgments
    if (this.missedHeartbeatAcks >= this.maxMissedHeartbeats) {
      issues.push(`${this.missedHeartbeatAcks} missed heartbeat ACKs`);
    }

    // Check for zombie connection (connected but no events)
    if (this.client.isReady() && this.lastEventTime) {
      const timeSinceLastEvent = Date.now() - this.lastEventTime.getTime();
      if (timeSinceLastEvent > this.zombieConnectionTimeoutMs) {
        issues.push(`No events for ${Math.floor(timeSinceLastEvent / 60000)} minutes (zombie connection)`);
        this.emit('zombieConnection', { timeSinceLastEvent });
      }
    }

    // Check latency
    if (metrics.apiLatency.average > 500) {
      issues.push(`High latency: ${Math.floor(metrics.apiLatency.average)}ms`);
    }

    // Determine overall health
    let overallHealth: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (issues.length > 0) {
      overallHealth = issues.some(issue => 
        issue.includes('zombie') || issue.includes('missed heartbeat')
      ) ? 'unhealthy' : 'degraded';
    }

    // Emit health status if it changed or if there are issues
    if (overallHealth !== 'healthy' || issues.length > 0) {
      console.log(`🏥 Health check: ${overallHealth.toUpperCase()}`, issues);
      this.emit('healthChange', { status: overallHealth, issues, metrics });
    }

    // Trigger auto-recovery if unhealthy
    if (overallHealth === 'unhealthy') {
      this.emit('unhealthy', { issues, metrics });
    }
  }

  /**
   * Get current health metrics
   */
  getMetrics(): HealthMetrics {
    const averageLatency = this.latencySamples.length > 0
      ? this.latencySamples.reduce((a, b) => a + b, 0) / this.latencySamples.length
      : 0;

    const currentLatency = this.latencySamples.length > 0
      ? this.latencySamples[this.latencySamples.length - 1]
      : 0;

    const eventsPerMinute = this.calculateEventsPerMinute();

    const issues: string[] = [];
    let overallHealth: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    // Quick health assessment
    if (this.lastHeartbeat) {
      const timeSinceHeartbeat = Date.now() - this.lastHeartbeat.getTime();
      if (timeSinceHeartbeat > this.heartbeatTimeoutMs) {
        issues.push('Heartbeat timeout');
        overallHealth = 'unhealthy';
      }
    }

    if (this.missedHeartbeatAcks >= this.maxMissedHeartbeats) {
      issues.push('Missed heartbeats');
      overallHealth = 'unhealthy';
    }

    if (this.client.isReady() && this.lastEventTime) {
      const timeSinceLastEvent = Date.now() - this.lastEventTime.getTime();
      if (timeSinceLastEvent > this.zombieConnectionTimeoutMs) {
        issues.push('Zombie connection');
        overallHealth = 'unhealthy';
      }
    }

    if (averageLatency > 500) {
      issues.push('High latency');
      if (overallHealth === 'healthy') overallHealth = 'degraded';
    }

    return {
      wsHeartbeat: {
        lastHeartbeat: this.lastHeartbeat,
        lastAck: this.lastHeartbeatAck,
        latency: currentLatency,
        missedAcks: this.missedHeartbeatAcks
      },
      apiLatency: {
        current: currentLatency,
        average: averageLatency,
        samples: [...this.latencySamples]
      },
      eventActivity: {
        lastEvent: this.lastEventTime,
        eventsPerMinute
      },
      overallHealth,
      issues
    };
  }

  /**
   * Check if connection appears to be a zombie
   */
  isZombieConnection(): boolean {
    if (!this.client.isReady() || !this.lastEventTime) {
      return false;
    }
    
    const timeSinceLastEvent = Date.now() - this.lastEventTime.getTime();
    return timeSinceLastEvent > this.zombieConnectionTimeoutMs;
  }

  /**
   * Get health status summary
   */
  getHealthSummary(): string {
    const metrics = this.getMetrics();
    const lastEventAgo = this.lastEventTime 
      ? Math.floor((Date.now() - this.lastEventTime.getTime()) / 1000)
      : 'N/A';
    
    return `Health: ${metrics.overallHealth}, ` +
           `Latency: ${Math.floor(metrics.apiLatency.average)}ms, ` +
           `Events/min: ${metrics.eventActivity.eventsPerMinute}, ` +
           `Last event: ${lastEventAgo}s ago`;
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.lastHeartbeat = null;
    this.lastHeartbeatAck = null;
    this.lastEventTime = null;
    this.missedHeartbeatAcks = 0;
    this.latencySamples = [];
    this.eventTimestamps = [];
  }
}

