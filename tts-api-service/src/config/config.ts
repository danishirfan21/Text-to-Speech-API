import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),

  // Database configuration (Redis for caching and job queue)
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0', 10),
  },

  // JWT configuration
  jwt: {
    secret:
      process.env.JWT_SECRET ||
      'your-super-secret-jwt-key-change-in-production',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  // Google Cloud TTS configuration
  googleCloud: {
    projectId: process.env.GOOGLE_CLOUD_PROJECT_ID || 'your-project-id',
    keyFile:
      process.env.GOOGLE_CLOUD_KEY_FILE ||
      path.join(__dirname, '../keys/google-cloud-key.json'),
  },

  // CORS configuration
  allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || [
    'http://localhost:3000',
    'http://localhost:3001',
  ],

  // File storage
  storage: {
    provider: process.env.STORAGE_PROVIDER || 'local', // 'local' | 'gcs' | 's3'
    localPath: process.env.LOCAL_STORAGE_PATH || './uploads',
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760', 10), // 10MB
  },

  // Rate limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '3600000', 10), // 1 hour
    freeLimit: parseInt(process.env.FREE_TIER_LIMIT || '100', 10),
    premiumLimit: parseInt(process.env.PREMIUM_TIER_LIMIT || '1000', 10),
  },

  // Cache settings
  cache: {
    ttl: parseInt(process.env.CACHE_TTL || '3600', 10), // 1 hour
    maxSize: parseInt(process.env.CACHE_MAX_SIZE || '1000', 10), // Max cached items
  },
};










