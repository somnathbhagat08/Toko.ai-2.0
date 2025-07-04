import Redis from 'ioredis';
import { log } from './vite.js';

class RedisManager {
  private redis: Redis | null = null;
  private isConnected = false;

  constructor() {
    // Only try to connect if Redis URL is explicitly provided
    if (process.env.REDIS_URL) {
      this.connect();
    } else {
      log('Redis not configured - running without Redis caching', 'redis');
    }
  }

  private async connect() {
    try {
      // Use Redis URL from environment or default to local Redis
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
      
      this.redis = new Redis(redisUrl, {
        connectTimeout: 10000,
        lazyConnect: true,
        enableReadyCheck: false,
        maxRetriesPerRequest: 3,
      });

      this.redis.on('connect', () => {
        log('Redis connected successfully', 'redis');
        this.isConnected = true;
      });

      this.redis.on('error', (error) => {
        log(`Redis connection error: ${error.message}`, 'redis');
        this.isConnected = false;
      });

      this.redis.on('ready', () => {
        log('Redis ready for operations', 'redis');
      });

      // Test connection
      await this.redis.ping();
      
    } catch (error) {
      log(`Failed to connect to Redis: ${error}`, 'redis');
      this.isConnected = false;
    }
  }

  // Session management
  async setSession(sessionId: string, data: any, ttl: number = 86400) {
    if (!this.isConnected || !this.redis) return false;
    
    try {
      await this.redis.setex(`session:${sessionId}`, ttl, JSON.stringify(data));
      return true;
    } catch (error) {
      log(`Redis session set error: ${error}`, 'redis');
      return false;
    }
  }

  async getSession(sessionId: string) {
    if (!this.isConnected || !this.redis) return null;
    
    try {
      const data = await this.redis.get(`session:${sessionId}`);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      log(`Redis session get error: ${error}`, 'redis');
      return null;
    }
  }

  async deleteSession(sessionId: string) {
    if (!this.isConnected || !this.redis) return false;
    
    try {
      await this.redis.del(`session:${sessionId}`);
      return true;
    } catch (error) {
      log(`Redis session delete error: ${error}`, 'redis');
      return false;
    }
  }

  // Rate limiting with token bucket
  async checkRateLimit(key: string, limit: number, window: number): Promise<boolean> {
    if (!this.isConnected || !this.redis) return true; // Allow if Redis unavailable
    
    try {
      const current = await this.redis.incr(`rate:${key}`);
      
      if (current === 1) {
        await this.redis.expire(`rate:${key}`, window);
      }
      
      return current <= limit;
    } catch (error) {
      log(`Redis rate limit error: ${error}`, 'redis');
      return true; // Allow on error
    }
  }

  // User presence and active connections
  async setUserOnline(userId: string, socketId: string) {
    if (!this.isConnected || !this.redis) return;
    
    try {
      await this.redis.hset('online_users', userId, JSON.stringify({
        socketId,
        lastSeen: Date.now(),
        status: 'online'
      }));
      
      // Set expiry for cleanup
      await this.redis.expire(`user:${userId}:presence`, 300); // 5 minutes
    } catch (error) {
      log(`Redis user online error: ${error}`, 'redis');
    }
  }

  async setUserOffline(userId: string) {
    if (!this.isConnected || !this.redis) return;
    
    try {
      await this.redis.hdel('online_users', userId);
      await this.redis.del(`user:${userId}:presence`);
    } catch (error) {
      log(`Redis user offline error: ${error}`, 'redis');
    }
  }

  async getOnlineUsers(): Promise<string[]> {
    if (!this.isConnected || !this.redis) return [];
    
    try {
      const users = await this.redis.hkeys('online_users');
      return users;
    } catch (error) {
      log(`Redis get online users error: ${error}`, 'redis');
      return [];
    }
  }

  // Pub/Sub for scaling across multiple servers
  async publishToRoom(roomId: string, event: string, data: any) {
    if (!this.isConnected || !this.redis) return;
    
    try {
      await this.redis.publish(`room:${roomId}`, JSON.stringify({ event, data }));
    } catch (error) {
      log(`Redis publish error: ${error}`, 'redis');
    }
  }

  async subscribeToRoom(roomId: string, callback: (event: string, data: any) => void) {
    if (!this.isConnected || !this.redis) return;
    
    try {
      const subscriber = this.redis.duplicate();
      await subscriber.subscribe(`room:${roomId}`);
      
      subscriber.on('message', (channel, message) => {
        try {
          const { event, data } = JSON.parse(message);
          callback(event, data);
        } catch (error) {
          log(`Redis subscribe parse error: ${error}`, 'redis');
        }
      });
      
      return subscriber;
    } catch (error) {
      log(`Redis subscribe error: ${error}`, 'redis');
    }
  }

  // Chat room analytics
  async incrementRoomStats(roomId: string, metric: string) {
    if (!this.isConnected || !this.redis) return;
    
    try {
      const today = new Date().toISOString().split('T')[0];
      await this.redis.hincrby(`stats:${today}`, `${roomId}:${metric}`, 1);
      await this.redis.expire(`stats:${today}`, 86400 * 7); // Keep for 7 days
    } catch (error) {
      log(`Redis stats error: ${error}`, 'redis');
    }
  }

  async getRoomStats(roomId: string, days: number = 7) {
    if (!this.isConnected || !this.redis) return {};
    
    try {
      const stats: any = {};
      const today = new Date();
      
      for (let i = 0; i < days; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        
        const dayStats = await this.redis.hgetall(`stats:${dateStr}`);
        stats[dateStr] = dayStats;
      }
      
      return stats;
    } catch (error) {
      log(`Redis get stats error: ${error}`, 'redis');
      return {};
    }
  }

  isReady(): boolean {
    return this.isConnected;
  }

  async disconnect() {
    if (this.redis) {
      await this.redis.disconnect();
      this.isConnected = false;
    }
  }
}

export const redisManager = new RedisManager();