import TTSAPIServer from './server';
import { logger } from './utils/logger';
import { config } from './config/config';

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

// Handle unhandled rejections
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Start the server
async function startServer() {
  try {
    const server = new TTSAPIServer();
    await server.start();
    
    logger.info('🚀 TTS API Server started successfully');
    logger.info(`📚 API Documentation: http://localhost:${config.port}/api/docs`);
    logger.info(`💊 Health Check: http://localhost:${config.port}/health`);
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
