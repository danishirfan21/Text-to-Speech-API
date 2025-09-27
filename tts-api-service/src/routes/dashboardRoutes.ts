import express from 'express';
import { TTSService } from '../services/TTSService';
import { CacheService } from '../services/CacheService';
import { JobQueue } from '../services/JobQueue';
import { userStore } from '../store/userStore';
import { logger } from '../utils/logger';
import { asyncHandler } from '../utils/asyncHandler';

const router = express.Router();

// GET /api/dashboard/stats - Get usage statistics
router.get(
  '/stats',
  asyncHandler(async (req: express.Request, res: express.Response) => {
    const user = req.user as any;
    const { timeframe = 'day' } = req.query;

    try {
      const ttsService = TTSService.getInstance();
      const cacheService = CacheService.getInstance();
      const jobQueue = new JobQueue();

      // Get user usage stats
      const usageStats = await ttsService.getUsageStats(
        user.id,
        timeframe as any
      );

      // Get cache statistics
      const cacheStats = await cacheService.getStats();

      // Get queue statistics
      const queueStats = await jobQueue.getQueueStats();

      // Get user info
      const userInfo = await userStore.findById(user.id);

      res.json({
        user: {
          id: user.id,
          email: user.email,
          tier: user.tier,
          memberSince: userInfo?.createdAt,
          lastLogin: userInfo?.lastLogin,
        },
        usage: {
          ...usageStats,
          monthlyRequests: userInfo?.usageStats?.monthlyRequests || 0,
          limit: user.tier === 'premium' ? 1000 : 100,
          remaining:
            (user.tier === 'premium' ? 1000 : 100) -
            (userInfo?.usageStats?.monthlyRequests || 0),
        },
        system: {
          cache: cacheStats,
          queue: queueStats,
        },
        timeframe,
      });
    } catch (error) {
      logger.error('Failed to get dashboard stats:', error);
      res.status(500).json({
        error: 'Failed to retrieve statistics',
        message: (error as any)?.message,
      });
    }
  })
);

// GET /api/dashboard/history - Get synthesis history
router.get(
  '/history',
  asyncHandler(async (req: express.Request, res: express.Response) => {
    const user = req.user as any;
    const { page = 1, limit = 10 } = req.query;

    try {
      // In production, this would query a proper database
      // For demo, return mock data based on user tier
      const mockHistory = [
        {
          id: 'job_001',
          text: 'Welcome to our text-to-speech service...',
          voice: 'en-US-Wavenet-D',
          audioEncoding: 'MP3',
          status: 'completed',
          duration: 15.3,
          size: 245760,
          createdAt: new Date(Date.now() - 1000 * 60 * 30), // 30 min ago
          completedAt: new Date(Date.now() - 1000 * 60 * 29),
        },
        {
          id: 'job_002',
          text: 'This is a test of the emergency broadcast system...',
          voice: 'en-US-Wavenet-F',
          audioEncoding: 'WAV',
          status: 'completed',
          duration: 8.7,
          size: 139520,
          createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2), // 2 hours ago
          completedAt: new Date(Date.now() - 1000 * 60 * 60 * 2 + 1000 * 5),
        },
        {
          id: 'job_003',
          text: 'Processing large document with multiple paragraphs...',
          voice: 'en-GB-Wavenet-A',
          audioEncoding: 'MP3',
          status: 'failed',
          error: 'Text too long for processing',
          createdAt: new Date(Date.now() - 1000 * 60 * 60 * 6), // 6 hours ago
        },
      ];

      const startIndex = (Number(page) - 1) * Number(limit);
      const endIndex = startIndex + Number(limit);
      const paginatedHistory = mockHistory.slice(startIndex, endIndex);

      res.json({
        history: paginatedHistory,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total: mockHistory.length,
          pages: Math.ceil(mockHistory.length / Number(limit)),
        },
      });
    } catch (error) {
      logger.error('Failed to get synthesis history:', error);
      res.status(500).json({
        error: 'Failed to retrieve history',
        message: (error as any)?.message,
      });
    }
  })
);

// GET /api/dashboard/voices - Get voice usage analytics
router.get(
  '/voices',
  asyncHandler(async (req: express.Request, res: express.Response) => {
    const user = req.user as any;

    try {
      const ttsService = TTSService.getInstance();
      const availableVoices = ttsService.getAvailableVoices();

      // Mock voice usage data
      const voiceUsage = [
        { voice: 'en-US-Wavenet-D', usage: 45, percentage: 45 },
        { voice: 'en-US-Wavenet-F', usage: 30, percentage: 30 },
        { voice: 'en-GB-Wavenet-A', usage: 15, percentage: 15 },
        { voice: 'en-AU-Wavenet-A', usage: 10, percentage: 10 },
      ];

      res.json({
        availableVoices: availableVoices.length,
        voiceUsage,
        mostPopular: voiceUsage[0],
        supportedLanguages: [
          ...new Set(availableVoices.map((v) => v.languageCode)),
        ],
      });
    } catch (error) {
      logger.error('Failed to get voice analytics:', error);
      res.status(500).json({
        error: 'Failed to retrieve voice analytics',
        message: (error as any)?.message,
      });
    }
  })
);

// GET /api/dashboard/performance - Get performance metrics
router.get(
  '/performance',
  asyncHandler(async (req: express.Request, res: express.Response) => {
    const { timeframe = 'hour' } = req.query;

    try {
      // Mock performance data
      const performanceData = {
        averageResponseTime: 2.3, // seconds
        successRate: 99.2, // percentage
        errorRate: 0.8, // percentage
        throughput: 156, // requests per hour
        peakHour: '14:00',
        slowestRequest: 15.7, // seconds
        fastestRequest: 0.8, // seconds
        statusCodes: {
          '200': 1247,
          '202': 89,
          '400': 12,
          '401': 3,
          '429': 8,
          '500': 2,
        },
        timeline: Array.from({ length: 24 }, (_, i) => ({
          hour: i,
          requests: Math.floor(Math.random() * 100) + 50,
          avgResponseTime: Math.random() * 3 + 1,
          errors: Math.floor(Math.random() * 5),
        })),
      };

      res.json({
        timeframe,
        performance: performanceData,
        lastUpdated: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Failed to get performance metrics:', error);
      res.status(500).json({
        error: 'Failed to retrieve performance metrics',
        message: (error as any)?.message,
      });
    }
  })
);

// POST /api/dashboard/upgrade - Upgrade user tier
router.post(
  '/upgrade',
  asyncHandler(async (req: express.Request, res: express.Response) => {
    const user = req.user as any;
    const { tier } = req.body;

    if (!['free', 'premium'].includes(tier)) {
      return res.status(400).json({
        error: 'Invalid tier',
        message: 'Tier must be either "free" or "premium"',
      });
    }

    try {
      await userStore.updateUser(user.id, { tier });

      logger.info('User tier updated', {
        userId: user.id,
        oldTier: user.tier,
        newTier: tier,
      });

      return res.json({
        message: 'Tier updated successfully',
        newTier: tier,
        newLimits: {
          requestsPerHour: tier === 'premium' ? 1000 : 100,
          features:
            tier === 'premium'
              ? [
                  'Higher rate limits',
                  'Priority support',
                  'Advanced voice options',
                  'Batch processing',
                ]
              : ['Basic TTS', 'Standard voices', 'Community support'],
        },
      });
    } catch (error) {
      logger.error('Failed to upgrade user tier:', error);
      return res.status(500).json({
        error: 'Failed to upgrade tier',
        message: (error as any)?.message,
      });
    }
  })
);

export default router;

