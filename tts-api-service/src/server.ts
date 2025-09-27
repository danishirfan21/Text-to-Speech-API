import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import compression from 'compression';
import morgan from 'morgan';
import { config } from './config/config';
import { errorHandler, notFound } from './middleware/errorMiddleware';
import { authMiddleware } from './middleware/authMiddleware';
import ttsRoutes from './routes/ttsRoutes';
import authRoutes from './routes/authRoutes';
import dashboardRoutes from './routes/dashboardRoutes';
import { connectRedis } from './config/redis';
import { logger } from './utils/logger';
import { CacheService } from './services/CacheService';
import { TTSServiceFactory } from './services/TTSServiceFactory';

class TTSAPIServer {
  private app: express.Application;
  private port: number;

  constructor() {
    this.app = express();
    this.port = config.port;
    this.initializeMiddleware();
    this.initializeRoutes();
    this.initializeErrorHandling();
  }

  private initializeMiddleware(): void {
    // Security middleware
    this.app.use(
      helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", 'data:', 'https:'],
          },
        },
      })
    );

    // Debug log for allowed origins
    // eslint-disable-next-line no-console
    console.log('CORS allowed origins:', config.allowedOrigins);

    // CORS configuration
    this.app.use(
      cors({
        origin: config.allowedOrigins,
        credentials: true,
      })
    );

    // Rate limiting
    const limiter = rateLimit({
      windowMs: 60 * 60 * 1000, // 1 hour
      max: (req: express.Request) => {
        const user = req.user as any;
        return user?.tier === 'premium' ? 1000 : 100;
      },
      message: {
        error: 'Rate limit exceeded',
        message: 'Too many requests. Upgrade to premium for higher limits.',
      },
      standardHeaders: true,
      legacyHeaders: false,
    });

    this.app.use('/api', limiter);

    // General middleware
    this.app.use(compression());
    this.app.use(
      morgan('combined', {
        stream: { write: (message) => logger.info(message.trim()) },
      })
    );
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
      });
    });
  }

  private initializeRoutes(): void {
    // Public routes
    this.app.use('/api/auth', authRoutes);

    // Protected routes
    this.app.use('/api/tts', authMiddleware, ttsRoutes);
    this.app.use('/api/dashboard', authMiddleware, dashboardRoutes);

    // API documentation
    this.app.get('/api/docs', (req, res) => {
      res.json({
        name: 'Text-to-Speech API',
        version: '1.0.0',
        description:
          'Production-ready TTS API with multiple voices and streaming',
        endpoints: {
          'POST /api/tts/synthesize': 'Convert text to audio',
          'GET /api/tts/voices': 'List available voices',
          'GET /api/tts/status/:jobId': 'Check synthesis job status',
          'GET /api/tts/download/:jobId': 'Download generated audio',
          'POST /api/auth/login': 'User authentication',
          'GET /api/dashboard/stats': 'Usage statistics',
        },
        rateLimit: {
          free: '100 requests/hour',
          premium: '1000 requests/hour',
        },
      });
    });
  }

  private initializeErrorHandling(): void {
    this.app.use(notFound);
    this.app.use(errorHandler);
  }

  public async start(): Promise<void> {
    try {
      // Initialize Redis connection
      await connectRedis();
      logger.info('Connected to Redis');

      // Initialize Redis connection
      await connectRedis();
      logger.info('Connected to Redis');

      // Initialize TTS services based on provider
      const ttsProvider = process.env.TTS_PROVIDER || 'huggingface';
      logger.info(`Initializing TTS service with provider: ${ttsProvider}`);
      // Initialize the selected TTS service
      const ttsService = TTSServiceFactory.createTTSService();
      await (ttsService as any).constructor.initialize();
      await CacheService.initialize();

      logger.info(`TTS services initialized with ${ttsProvider} provider`);

      // Start server
      this.app.listen(this.port, () => {
        logger.info(`TTS API Server running on port ${this.port}`);
        logger.info(`Environment: ${config.nodeEnv}`);
        logger.info(`TTS Provider: ${ttsProvider}`);
        logger.info(`Documentation: http://localhost:${this.port}/api/docs`);
      });
    } catch (error) {
      logger.error('Failed to start server:', error);
      process.exit(1);
    }
  }

  public getApp(): express.Application {
    return this.app;
  }
}

export default TTSAPIServer;
