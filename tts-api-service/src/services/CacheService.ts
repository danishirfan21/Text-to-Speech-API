import Redis from 'ioredis';
import { config } from '../config/config';
import { logger } from '../utils/logger';

export class CacheService {
  private static instance: CacheService;
  private redis: Redis;
  private isConnected: boolean = false;

  constructor() {
    this.redis = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password || '',
      db: config.redis.db,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });

    this.redis.on('connect', () => {
      this.isConnected = true;
      logger.info('Connected to Redis cache');
    });

    this.redis.on('error', (error) => {
      this.isConnected = false;
      logger.error('Redis cache error:', error);
    });
  }

  public static getInstance(): CacheService {
    if (!CacheService.instance) {
      CacheService.instance = new CacheService();
    }
    return CacheService.instance;
  }

  public static async initialize(): Promise<void> {
    const instance = CacheService.getInstance();
    await instance.connect();
  }

  private async connect(): Promise<void> {
    try {
      await this.redis.connect();
      logger.info('Cache service initialized');
    } catch (error) {
      logger.error('Failed to connect to Redis:', error);
      throw error;
    }
  }

  async set(key: string, value: any, ttlSeconds?: number): Promise<void> {
    if (!this.isConnected) {
      logger.warn('Redis not connected, skipping cache set');
      return;
    }

    try {
      const serializedValue = this.serialize(value);
      if (ttlSeconds) {
        await this.redis.setex(
          this.formatKey(key),
          ttlSeconds,
          serializedValue
        );
      } else {
        await this.redis.set(this.formatKey(key), serializedValue);
      }
    } catch (error) {
      logger.error('Cache set error:', error);
    }
  }

  async get(key: string): Promise<any> {
    if (!this.isConnected) {
      return null;
    }

    try {
      const value = await this.redis.get(this.formatKey(key));
      return value ? this.deserialize(value) : null;
    } catch (error) {
      logger.error('Cache get error:', error);
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    try {
      await this.redis.del(this.formatKey(key));
    } catch (error) {
      logger.error('Cache delete error:', error);
    }
  }

  async exists(key: string): Promise<boolean> {
    if (!this.isConnected) {
      return false;
    }

    try {
      const result = await this.redis.exists(this.formatKey(key));
      return result === 1;
    } catch (error) {
      logger.error('Cache exists error:', error);
      return false;
    }
  }

  async flush(): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    try {
      await this.redis.flushdb();
      logger.info('Cache flushed');
    } catch (error) {
      logger.error('Cache flush error:', error);
    }
  }

  async getStats(): Promise<{
    totalKeys: number;
    memoryUsage: string;
    hitRate: number;
  }> {
    if (!this.isConnected) {
      return { totalKeys: 0, memoryUsage: '0B', hitRate: 0 };
    }

    try {
      const info = await this.redis.info('memory');
      const keyCount = await this.redis.dbsize();

      const memoryMatch = info.match(/used_memory_human:(.+)\r/);
        const memoryUsage = memoryMatch ? memoryMatch[1] ?? '0B' : '0B';

      // Calculate hit rate from Redis stats
      const stats = await this.redis.info('stats');
      const hitsMatch = stats.match(/keyspace_hits:(\d+)/);
      const missesMatch = stats.match(/keyspace_misses:(\d+)/);

        const hits = hitsMatch ? parseInt(hitsMatch[1] ?? '0') : 0;
        const misses = missesMatch ? parseInt(missesMatch[1] ?? '0') : 0;
      const hitRate = hits + misses > 0 ? (hits / (hits + misses)) * 100 : 0;

      return {
        totalKeys: keyCount,
        memoryUsage,
        hitRate: Math.round(hitRate * 100) / 100,
      };
    } catch (error) {
  logger.error('Error getting cache stats:', error);
      return { totalKeys: 0, memoryUsage: '0B', hitRate: 0 };
    }
  }

  private formatKey(key: string): string {
    return `tts:${key}`;
  }

  private serialize(value: any): string {
    if (Buffer.isBuffer(value)) {
      return JSON.stringify({
        type: 'Buffer',
        data: value.toString('base64'),
      });
    }
    return JSON.stringify(value);
  }

  private deserialize(value: string): any {
    try {
      const parsed = JSON.parse(value);
      if (parsed && parsed.type === 'Buffer') {
        return Buffer.from(parsed.data, 'base64');
      }
      return parsed;
    } catch (error) {
      return value;
    }
  }
}

