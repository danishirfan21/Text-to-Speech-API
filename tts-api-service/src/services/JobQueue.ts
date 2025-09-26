import { EventEmitter } from 'events';
import { CacheService } from './CacheService';
import { logger } from '../utils/logger';
import { SynthesisJob } from './TTSService';

export class JobQueue extends EventEmitter {
  private cacheService: CacheService;
  private processingJobs: Set<string> = new Set();
  private jobProcessor: NodeJS.Timeout | null = null;
  // Removed duplicate jobProcessor declaration

  constructor() {
    super();
    this.cacheService = CacheService.getInstance();
  }

  async initialize(): Promise<void> {
    // Start job processor
    this.startJobProcessor();
    logger.info('Job queue initialized');
  }

  async addJob(job: SynthesisJob, userId: string): Promise<void> {
    try {
      // Store job in cache
      await this.cacheService.set(`job:${job.id}`, job, 3600); // 1 hour TTL

      // Add to processing queue
      await this.cacheService.set(
        `queue:pending:${job.id}`,
        {
          jobId: job.id,
          userId,
          priority: 1,
          addedAt: new Date(),
        },
        3600
      );

      logger.info('Job added to queue', { jobId: job.id, userId });
      this.emit('jobAdded', job);
    } catch (error) {
        logger.error('Failed to add job to queue:', error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  async getJob(jobId: string): Promise<SynthesisJob | null> {
    try {
      return await this.cacheService.get(`job:${jobId}`);
    } catch (error) {
        logger.error('Failed to get job:', error instanceof Error ? error.message : String(error));
      return null;
    }
  }

  async updateJob(
    jobId: string,
    updates: Partial<SynthesisJob>
  ): Promise<void> {
    try {
      const job = await this.getJob(jobId);
      if (!job) {
        throw new Error('Job not found');
      }

      const updatedJob = { ...job, ...updates };
      await this.cacheService.set(`job:${jobId}`, updatedJob, 3600);

      this.emit('jobUpdated', updatedJob);
    } catch (error) {
        logger.error('Failed to update job:', error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  private startJobProcessor(): void {
    this.jobProcessor = setInterval(async () => {
      try {
        await this.processNextJob();
      } catch (error) {
          logger.error('Job processor error:', error instanceof Error ? error.message : String(error));
      }
    }, 1000); // Process jobs every second
  }

  private async processNextJob(): Promise<void> {
    // Get pending jobs (simplified implementation)
    // In production, use Redis lists or sorted sets for better queue management
    const redis = (this.cacheService as any).redis;
    const keys = await redis.keys('tts:queue:pending:*');

    if (keys.length === 0) {
      return;
    }

    // Get the first pending job
    const queueKey = keys[0];
    const queueItem = await this.cacheService.get(queueKey.replace('tts:', ''));

    if (!queueItem || this.processingJobs.has(queueItem.jobId)) {
      return;
    }

    this.processingJobs.add(queueItem.jobId);

    try {
      // Remove from pending queue
      await this.cacheService.delete(queueKey.replace('tts:', ''));

      // Process the job
      await this.processJob(queueItem.jobId);
    } finally {
      this.processingJobs.delete(queueItem.jobId);
    }
  }

  private async processJob(jobId: string): Promise<void> {
    const job = await this.getJob(jobId);
      if (!job) {
        logger.error('Job not found for processing:', jobId);
        return;
    }

    try {
      // Update job status to processing
      await this.updateJob(jobId, {
        status: 'processing',
        progress: 10,
      });

      // Import TTSService dynamically to avoid circular dependency
      const { TTSService } = await import('./TTSService');
      const ttsService = TTSService.getInstance();

      // Update progress
      await this.updateJob(jobId, { progress: 50 });

      // Perform the actual synthesis
      const audioBuffer = await ttsService.synthesizeText(
        {
          ...job.request,
          async: false, // Force synchronous processing
        },
        'system'
      );

      if (!Buffer.isBuffer(audioBuffer)) {
        throw new Error('Expected audio buffer from synthesis');
      }

      // Calculate audio metadata
      const { AudioConverter } = await import('../utils/AudioConverter');
      const audioConverter = new AudioConverter();
      const duration = await audioConverter.getDuration(audioBuffer);

      // Update job with result
      await this.updateJob(jobId, {
        status: 'completed',
        progress: 100,
        completedAt: new Date(),
        result: {
          audioUrl: `/api/tts/download/${jobId}`,
          audioContent: audioBuffer,
          duration,
          size: audioBuffer.length,
        },
      });

      logger.info('Job completed successfully', {
        jobId,
        duration,
        size: audioBuffer.length,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('Job processing failed:', { jobId, error: errorMsg });
      await this.updateJob(jobId, {
        status: 'failed',
        error: errorMsg,
        completedAt: new Date(),
      });
    }
  }

  async getQueueStats(): Promise<{
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  }> {
    try {
      const redis = (this.cacheService as any).redis;
      const pendingKeys = await redis.keys('tts:queue:pending:*');
      const processing = this.processingJobs.size;

      // Get completed and failed jobs from the last hour
      const jobKeys = await redis.keys('tts:job:*');
      let completed = 0;
      let failed = 0;

      for (const key of jobKeys.slice(0, 100)) {
        // Limit to prevent performance issues
        const job = await this.cacheService.get(key.replace('tts:', ''));
        if (job) {
          if (job.status === 'completed') completed++;
          if (job.status === 'failed') failed++;
        }
      }

      return {
        pending: pendingKeys.length,
        processing,
        completed,
        failed,
      };
    } catch (error) {
      logger.error('Failed to get queue stats:', error instanceof Error ? error.message : String(error));
      return { pending: 0, processing: 0, completed: 0, failed: 0 };
    }
  }

  destroy(): void {
    if (this.jobProcessor) {
      clearInterval(this.jobProcessor as NodeJS.Timeout);
      this.jobProcessor = null;
    }
  }
}

