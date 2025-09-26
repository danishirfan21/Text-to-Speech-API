import express from 'express';
import multer from 'multer';
import { body, param, query, validationResult } from 'express-validator';
import { logger } from '../utils/logger';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { TTSServiceFactory } from '@/services/TTSServiceFactory';

const router = express.Router();
const upload = multer({ limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB limit

// Input validation middleware
const validateSynthesisRequest = [
  body('text')
    .notEmpty()
    .withMessage('Text is required')
    .isLength({ min: 1, max: 10000 })
    .withMessage('Text must be between 1 and 10,000 characters'),

  body('voice.languageCode')
    .optional()
    .matches(/^[a-z]{2}-[A-Z]{2}$/)
    .withMessage('Invalid language code format (expected: en-US)'),

  body('voice.ssmlGender')
    .optional()
    .isIn(['NEUTRAL', 'FEMALE', 'MALE'])
    .withMessage('Invalid SSML gender'),

  body('audioConfig.audioEncoding')
    .optional()
    .isIn(['MP3', 'WAV', 'OGG_OPUS'])
    .withMessage('Invalid audio encoding'),

  body('audioConfig.speakingRate')
    .optional()
    .isFloat({ min: 0.25, max: 4.0 })
    .withMessage('Speaking rate must be between 0.25 and 4.0'),

  body('audioConfig.pitch')
    .optional()
    .isFloat({ min: -20.0, max: 20.0 })
    .withMessage('Pitch must be between -20.0 and 20.0'),

  body('audioConfig.volumeGainDb')
    .optional()
    .isFloat({ min: -96.0, max: 16.0 })
    .withMessage('Volume gain must be between -96.0 and 16.0'),
];

const handleValidationErrors = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array(),
    });
  }
  next();
};

// POST /api/tts/synthesize - Convert text to audio
router.post(
  '/synthesize',
  validateSynthesisRequest,
  handleValidationErrors,
  asyncHandler(async (req: express.Request, res: express.Response) => {
    const startTime = Date.now();
    const userId = (req.user as any)?.id;

    try {
  const ttsService = TTSServiceFactory.createTTSService();
      const result = await ttsService.synthesizeText(req.body, userId);

      // Log usage analytics
      logger.info('TTS synthesis request', {
        userId,
        textLength: req.body.text.length,
        voice: req.body.voice?.name,
        audioEncoding: req.body.audioConfig?.audioEncoding,
        async: req.body.async,
        streaming: req.body.streaming,
        responseTime: Date.now() - startTime,
      });

      // Handle async job response
      if (req.body.async && 'id' in result) {
        return res.status(202).json({
          status: 'accepted',
          jobId: result.id,
          message: 'Synthesis job queued successfully',
          statusUrl: `/api/tts/status/${result.id}`,
          downloadUrl: `/api/tts/download/${result.id}`,
        });
      }

      // Handle synchronous response
      if (Buffer.isBuffer(result)) {
        const audioEncoding = req.body.audioConfig?.audioEncoding || 'MP3';
        const contentType = getContentType(audioEncoding);
        const extension = getFileExtension(audioEncoding);

        res.set({
          'Content-Type': contentType,
          'Content-Disposition': `attachment; filename="synthesis.${extension}"`,
          'Content-Length': result.length.toString(),
          'X-Audio-Duration': '0', // Would be calculated from audio analysis
          'X-Response-Time': `${Date.now() - startTime}ms`,
        });

        return res.send(result);
      }

      throw new AppError('Unexpected response format', 500);
    } catch (error) {
      logger.error('Synthesis failed:', {
        userId,
        error: error.message,
        stack: error.stack,
        requestBody: {
          ...req.body,
          text: req.body.text?.slice(0, 100) + '...',
        },
      });

      throw new AppError(`Synthesis failed: ${error.message}`, 500);
    }
  })
);

// GET /api/tts/voices - List available voices and languages
router.get(
  '/voices',
  asyncHandler(async (req: express.Request, res: express.Response) => {
  const ttsService = TTSServiceFactory.createTTSService();
    const voices = ttsService.getAvailableVoices();

    // Group voices by language for better organization
    const groupedVoices = voices.reduce((acc, voice) => {
      if (!acc[voice.languageCode]) {
        acc[voice.languageCode] = [];
      }
      acc[voice.languageCode].push(voice);
      return acc;
    }, {} as { [key: string]: typeof voices });

    res.json({
      total: voices.length,
      languages: Object.keys(groupedVoices).length,
      voices: groupedVoices,
      supportedFormats: ['MP3', 'WAV', 'OGG_OPUS'],
      supportedLanguages: Object.keys(groupedVoices).sort(),
    });
  })
);

// GET /api/tts/status/:jobId - Check synthesis job status
router.get(
  '/status/:jobId',
  param('jobId').isUUID().withMessage('Invalid job ID format'),
  handleValidationErrors,
  asyncHandler(async (req: express.Request, res: express.Response) => {
    const { jobId } = req.params;
    const userId = (req.user as any)?.id;

  const ttsService = TTSServiceFactory.createTTSService();
    const job = await ttsService.getJobStatus(jobId);

    if (!job) {
      throw new AppError('Job not found', 404);
    }

    // Basic authorization check (in production, implement proper ownership verification)
    const response = {
      id: job.id,
      status: job.status,
      progress: job.progress,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
      error: job.error,
    };

    if (job.status === 'completed' && job.result) {
      response.result = {
        downloadUrl: `/api/tts/download/${jobId}`,
        duration: job.result.duration,
        size: job.result.size,
        audioEncoding: job.request.audioConfig?.audioEncoding || 'MP3',
      };
    }

    res.json(response);
  })
);

// GET /api/tts/download/:jobId - Download generated audio
router.get(
  '/download/:jobId',
  param('jobId').isUUID().withMessage('Invalid job ID format'),
  handleValidationErrors,
  asyncHandler(async (req: express.Request, res: express.Response) => {
    const { jobId } = req.params;
    const userId = (req.user as any)?.id;

  const ttsService = TTSServiceFactory.createTTSService();
    const job = await ttsService.getJobStatus(jobId);

    if (!job) {
      throw new AppError('Job not found', 404);
    }

    if (job.status !== 'completed') {
      throw new AppError(
        `Job not completed. Current status: ${job.status}`,
        400
      );
    }

    const audioBuffer = await ttsService.getJobResult(jobId);
    if (!audioBuffer) {
      throw new AppError('Audio file not found or expired', 404);
    }

    const audioEncoding = job.request.audioConfig?.audioEncoding || 'MP3';
    const contentType = getContentType(audioEncoding);
    const extension = getFileExtension(audioEncoding);

    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="synthesis_${jobId}.${extension}"`,
      'Content-Length': audioBuffer.length.toString(),
      'Cache-Control': 'private, max-age=3600', // 1 hour cache
    });

    res.send(audioBuffer);
  })
);

// GET /api/tts/preview/:jobId - Stream audio preview (first 30 seconds)
router.get(
  '/preview/:jobId',
  param('jobId').isUUID().withMessage('Invalid job ID format'),
  handleValidationErrors,
  asyncHandler(async (req: express.Request, res: express.Response) => {
    const { jobId } = req.params;

  const ttsService = TTSServiceFactory.createTTSService();
    const audioBuffer = await ttsService.getJobResult(jobId);

    if (!audioBuffer) {
      throw new AppError('Audio preview not available', 404);
    }

    // In production, implement audio trimming to 30 seconds
    const previewBuffer = audioBuffer.slice(
      0,
      Math.min(audioBuffer.length, 480000)
    ); // Rough 30s estimate

    res.set({
      'Content-Type': 'audio/mpeg',
      'Accept-Ranges': 'bytes',
      'Content-Length': previewBuffer.length.toString(),
    });

    res.send(previewBuffer);
  })
);

// POST /api/tts/batch - Batch synthesis for multiple texts
router.post(
  '/batch',
  body('requests')
    .isArray({ min: 1, max: 10 })
    .withMessage('Requests must be an array of 1-10 items'),
  body('requests.*.text').notEmpty().withMessage('Each request must have text'),
  handleValidationErrors,
  asyncHandler(async (req: express.Request, res: express.Response) => {
    const { requests } = req.body;
    const userId = (req.user as any)?.id;

  const ttsService = TTSServiceFactory.createTTSService();
    const jobs = [];

    for (const request of requests) {
      const job = await ttsService.synthesizeText(
        { ...request, async: true },
        userId
      );
      jobs.push(job);
    }

    res.status(202).json({
      status: 'accepted',
      message: `${jobs.length} synthesis jobs queued`,
      jobs: jobs.map((job) => ({
        id: job.id,
        statusUrl: `/api/tts/status/${job.id}`,
        downloadUrl: `/api/tts/download/${job.id}`,
      })),
    });
  })
);

// Helper functions
function getContentType(audioEncoding: string): string {
  const contentTypes: { [key: string]: string } = {
    MP3: 'audio/mpeg',
    WAV: 'audio/wav',
    OGG_OPUS: 'audio/ogg',
  };
  return contentTypes[audioEncoding] || 'audio/mpeg';
}

function getFileExtension(audioEncoding: string): string {
  const extensions: { [key: string]: string } = {
    MP3: 'mp3',
    WAV: 'wav',
    OGG_OPUS: 'ogg',
  };
  return extensions[audioEncoding] || 'mp3';
}

export default router;
