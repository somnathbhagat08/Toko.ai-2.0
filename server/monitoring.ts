import { log } from './vite.js';
import { redisManager } from './redis.js';

interface MetricData {
  timestamp: number;
  value: number;
  tags?: Record<string, string>;
}

interface SystemMetrics {
  activeConnections: number;
  activeRooms: number;
  messagesPerSecond: number;
  videoCalls: number;
  memoryUsage: number;
  cpuUsage: number;
}

class MonitoringService {
  private metrics: Map<string, MetricData[]> = new Map();
  private metricsBuffer: Map<string, number> = new Map();
  private startTime: number = Date.now();

  constructor() {
    // Start periodic metrics collection
    setInterval(() => this.collectSystemMetrics(), 30000); // Every 30 seconds
    setInterval(() => this.flushMetrics(), 60000); // Every minute
  }

  // Real-time metrics tracking
  incrementCounter(metric: string, tags?: Record<string, string>) {
    const key = this.getMetricKey(metric, tags);
    const current = this.metricsBuffer.get(key) || 0;
    this.metricsBuffer.set(key, current + 1);
  }

  recordGauge(metric: string, value: number, tags?: Record<string, string>) {
    const key = this.getMetricKey(metric, tags);
    this.metricsBuffer.set(key, value);
  }

  recordTiming(metric: string, duration: number, tags?: Record<string, string>) {
    const key = this.getMetricKey(metric, tags);
    const existing = this.metrics.get(key) || [];
    existing.push({
      timestamp: Date.now(),
      value: duration,
      tags
    });
    this.metrics.set(key, existing.slice(-100)); // Keep last 100 measurements
  }

  private getMetricKey(metric: string, tags?: Record<string, string>): string {
    if (!tags) return metric;
    const tagString = Object.entries(tags)
      .map(([k, v]) => `${k}:${v}`)
      .sort()
      .join(',');
    return `${metric}{${tagString}}`;
  }

  private async collectSystemMetrics() {
    try {
      // Memory usage
      const memUsage = process.memoryUsage();
      this.recordGauge('system.memory.used', memUsage.heapUsed);
      this.recordGauge('system.memory.total', memUsage.heapTotal);
      this.recordGauge('system.memory.rss', memUsage.rss);

      // Uptime
      const uptime = Date.now() - this.startTime;
      this.recordGauge('system.uptime', uptime);

      // Redis metrics if available
      if (redisManager.isReady()) {
        const onlineUsers = await redisManager.getOnlineUsers();
        this.recordGauge('users.online', onlineUsers.length);
      }

      log(`System metrics collected: Memory ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB, Uptime ${Math.round(uptime / 1000)}s`, 'metrics');
    } catch (error) {
      log(`Error collecting system metrics: ${error}`, 'metrics');
    }
  }

  private async flushMetrics() {
    try {
      // Convert buffer to time-series data
      for (const [key, value] of this.metricsBuffer.entries()) {
        const existing = this.metrics.get(key) || [];
        existing.push({
          timestamp: Date.now(),
          value,
        });
        this.metrics.set(key, existing.slice(-1000)); // Keep last 1000 points
      }

      // Store aggregated metrics in Redis for cross-server visibility
      if (redisManager.isReady()) {
        const serverMetrics = this.getAggregatedMetrics();
        await redisManager.setSession('server:metrics', serverMetrics, 300); // 5 minutes TTL
      }

      // Clear buffer
      this.metricsBuffer.clear();
    } catch (error) {
      log(`Error flushing metrics: ${error}`, 'metrics');
    }
  }

  getAggregatedMetrics(): Record<string, any> {
    const aggregated: Record<string, any> = {};

    for (const [key, values] of this.metrics.entries()) {
      if (values.length === 0) continue;

      const recent = values.slice(-10); // Last 10 measurements
      const sum = recent.reduce((acc, v) => acc + v.value, 0);
      const avg = sum / recent.length;
      const max = Math.max(...recent.map(v => v.value));
      const min = Math.min(...recent.map(v => v.value));

      aggregated[key] = {
        current: recent[recent.length - 1]?.value || 0,
        average: avg,
        maximum: max,
        minimum: min,
        count: recent.length,
        timestamp: Date.now()
      };
    }

    return aggregated;
  }

  // Application-specific metrics
  trackUserConnection(userId: string) {
    this.incrementCounter('connections.new', { type: 'user' });
    log(`User connected: ${userId}`, 'connections');
  }

  trackUserDisconnection(userId: string) {
    this.incrementCounter('connections.closed', { type: 'user' });
    log(`User disconnected: ${userId}`, 'connections');
  }

  trackMatchMaking(success: boolean, waitTime?: number) {
    this.incrementCounter('matchmaking.attempts', { result: success ? 'success' : 'failed' });
    if (success && waitTime) {
      this.recordTiming('matchmaking.wait_time', waitTime);
    }
  }

  trackMessage(roomId: string, type: 'text' | 'video' | 'audio') {
    this.incrementCounter('messages.sent', { type, room: roomId });
  }

  trackVideoCall(action: 'start' | 'end', duration?: number) {
    this.incrementCounter('video_calls.actions', { action });
    if (action === 'end' && duration) {
      this.recordTiming('video_calls.duration', duration);
    }
  }

  trackError(type: string, message: string) {
    this.incrementCounter('errors.count', { type });
    log(`Error tracked: ${type} - ${message}`, 'errors');
  }

  // Health check endpoint data
  getHealthStatus(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    uptime: number;
    memory: NodeJS.MemoryUsage;
    redis: boolean;
    version: string;
    timestamp: string;
  } {
    const memUsage = process.memoryUsage();
    const uptime = Date.now() - this.startTime;
    
    // Determine health status based on metrics
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    
    // Check memory usage (unhealthy if > 90% of heap)
    if (memUsage.heapUsed / memUsage.heapTotal > 0.9) {
      status = 'unhealthy';
    } else if (memUsage.heapUsed / memUsage.heapTotal > 0.75) {
      status = 'degraded';
    }

    return {
      status,
      uptime,
      memory: memUsage,
      redis: redisManager.isReady(),
      version: process.env.npm_package_version || '1.0.0',
      timestamp: new Date().toISOString()
    };
  }

  // Export metrics for external monitoring (Prometheus format)
  exportPrometheusMetrics(): string {
    let output = '';
    
    for (const [key, values] of this.metrics.entries()) {
      if (values.length === 0) continue;
      
      const latest = values[values.length - 1];
      const metricName = key.replace(/[^a-zA-Z0-9_]/g, '_');
      
      output += `# TYPE ${metricName} gauge\n`;
      output += `${metricName} ${latest.value} ${latest.timestamp}\n`;
    }
    
    return output;
  }

  // Real-time stats for admin dashboard
  getLiveStats() {
    return {
      ...this.getAggregatedMetrics(),
      health: this.getHealthStatus(),
      timestamp: new Date().toISOString()
    };
  }
}

export const monitoring = new MonitoringService();