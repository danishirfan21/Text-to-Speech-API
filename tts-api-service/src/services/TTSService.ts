import { TextToSpeechClient } from '@google-cloud/text-to-speech';
import { v4 as uuidv4 } from 'uuid';
import { PassThrough } from 'stream';
import { config } from '../config/config';
import { logger } from '../utils/logger';
import { CacheService } from './CacheService';
import { JobQueue } from './JobQueue';
import { TextPreprocessor } from '../utils/TextPreprocessor';
import { AudioConverter } from '../utils/AudioConverter';

export interface SynthesisRequest {
  text: string;
  voice?: {
    languageCode?: string;
    name?: string;
    ssmlGender?: 'NEUTRAL' | 'FEMALE' | 'MALE';
  };
  audioConfig?: {
    audioEncoding?: 'MP3' | 'WAV' | 'OGG_OPUS';
    speakingRate?: number;
    pitch?: number;
    volumeGainDb?: number;
    sampleRateHertz?: number;
  };
  async?: boolean;
  streaming?: boolean;
}

export interface SynthesisJob {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  request: SynthesisRequest;
  result?: {
    audioUrl: string;
    audioContent?: Buffer;
    duration: number;
    size: number;
  };
  error?: string;
  createdAt: Date;
  completedAt?: Date;
}

export interface Voice {
  name: string;
  languageCode: string;
  ssmlGender: string;
  naturalSampleRateHertz: number;
  description?: string;
}

export class TTSService {
  private static instance: TTSService;
  private ttsClient: TextToSpeechClient;
  private jobQueue: JobQueue;
  private cacheService: CacheService;
  private textPreprocessor: TextPreprocessor;
  private audioConverter: AudioConverter;
  private availableVoices: Voice[] = [];

  constructor() {
    this.ttsClient = new TextToSpeechClient({
      keyFilename: config.tts.googleCloud.keyFile,
      projectId: config.tts.googleCloud.projectId,
    });
    this.jobQueue = new JobQueue();
    this.cacheService = new CacheService();
    this.textPreprocessor = new TextPreprocessor();
    this.audioConverter = new AudioConverter();
  }

  public static getInstance(): TTSService {
    if (!TTSService.instance) {
      TTSService.instance = new TTSService();
    }
    return TTSService.instance;
  }

  public static async initialize(): Promise<void> {
    const instance = TTSService.getInstance();
    await instance.loadAvailableVoices();
    await instance.jobQueue.initialize();
    logger.info('TTS Service initialized');
  }

  private async loadAvailableVoices(): Promise<void> {
    try {
      const [response] = await this.ttsClient.listVoices({});
      this.availableVoices =
        response.voices?.map((voice) => ({
          name: voice.name || '',
          languageCode: voice.languageCodes?.[0] || '',
          ssmlGender: String(voice.ssmlGender || 'NEUTRAL'),
          naturalSampleRateHertz: voice.naturalSampleRateHertz || 22050,
          description: `${voice.languageCodes?.[0]} - ${voice.ssmlGender}`,
        })) || [];

      logger.info(`Loaded ${this.availableVoices.length} available voices`);
    } catch (error) {
      logger.error('Failed to load voices:', error);
      // Fallback to default voices if API fails
      this.availableVoices = this.getDefaultVoices();
    }
  }

  private getDefaultVoices(): Voice[] {
    return [
      {
        name: 'en-US-Wavenet-D',
        languageCode: 'en-US',
        ssmlGender: 'MALE',
        naturalSampleRateHertz: 24000,
        description: 'US English - Male (Wavenet)',
      },
      {
        name: 'en-US-Wavenet-F',
        languageCode: 'en-US',
        ssmlGender: 'FEMALE',
        naturalSampleRateHertz: 24000,
        description: 'US English - Female (Wavenet)',
      },
      {
        name: 'en-GB-Wavenet-A',
        languageCode: 'en-GB',
        ssmlGender: 'FEMALE',
        naturalSampleRateHertz: 24000,
        description: 'British English - Female (Wavenet)',
      },
    ];
  }

  public getAvailableVoices(): Voice[] {
    return this.availableVoices;
  }

  public async synthesizeText(
    request: SynthesisRequest,
    userId: string
  ): Promise<SynthesisJob | Buffer> {
    try {
      // Preprocess text
      const processedText = await this.textPreprocessor.process(request.text);

      // Generate cache key
      const cacheKey = this.generateCacheKey(processedText, request);

      // Check cache first
      const cachedResult = await this.cacheService.get(cacheKey);
      if (cachedResult) {
        logger.info('Returning cached audio result');
        return cachedResult;
      }

      // Handle async requests
      if (request.async) {
        const job: SynthesisJob = {
          id: uuidv4(),
          status: 'pending',
          progress: 0,
          request: { ...request, text: processedText },
          createdAt: new Date(),
        };

        await this.jobQueue.addJob(job, userId);
        return job;
      }

      // Handle streaming requests
      if (request.streaming) {
        return this.synthesizeStreaming(processedText, request, cacheKey);
      }

      // Synchronous synthesis
      const audioBuffer = await this.performSynthesis(processedText, request);

      // Cache result
      await this.cacheService.set(cacheKey, audioBuffer, 3600); // 1 hour cache

      return audioBuffer;
    } catch (error: any) {
      logger.error('Text synthesis failed:', error);
      throw new Error(`Synthesis failed: ${error?.message}`);
    }
  }

  private async performSynthesis(
    text: string,
    request: SynthesisRequest
  ): Promise<Buffer> {
    const synthesisRequest = {
      input: { text },
      voice: {
        languageCode: request.voice?.languageCode || 'en-US',
        name: request.voice?.name || 'en-US-Wavenet-D',
        ssmlGender: request.voice?.ssmlGender || 'NEUTRAL',
      },
      audioConfig: {
        audioEncoding: this.mapAudioEncoding(
          request.audioConfig?.audioEncoding || 'MP3'
        ),
        speakingRate: request.audioConfig?.speakingRate || 1.0,
        pitch: request.audioConfig?.pitch || 0,
        volumeGainDb: request.audioConfig?.volumeGainDb || 0,
        sampleRateHertz: request.audioConfig?.sampleRateHertz || 24000,
      },
    };

    const [response] = await this.ttsClient.synthesizeSpeech(synthesisRequest);

    if (!response.audioContent) {
      throw new Error('No audio content received from TTS service');
    }

    let audioBuffer = response.audioContent as Buffer;

    // Convert audio format if needed
    if (
      request.audioConfig?.audioEncoding &&
      request.audioConfig.audioEncoding !== 'MP3'
    ) {
      audioBuffer = await this.audioConverter.convert(
        audioBuffer,
        'mp3',
        request.audioConfig.audioEncoding.toLowerCase()
      );
    }

    return audioBuffer;
  }

  private async synthesizeStreaming(
    text: string,
    request: SynthesisRequest,
    cacheKey: string
  ): Promise<Buffer> {
    // For large texts, split into chunks and stream
    const chunks = this.textPreprocessor.splitIntoChunks(text, 500);
    const audioChunks: Buffer[] = [];

    for (let i = 0; i < chunks.length; i++) {
  const chunk = chunks[i] ?? '';
  const chunkBuffer = await this.performSynthesis(chunk, request);
  audioChunks.push(chunkBuffer);
    }

    // Concatenate all audio chunks
    const finalBuffer = Buffer.concat(audioChunks);

    // Cache the complete result
    await this.cacheService.set(cacheKey, finalBuffer, 3600);

    return finalBuffer;
  }

  public async getJobStatus(jobId: string): Promise<SynthesisJob | null> {
    return this.jobQueue.getJob(jobId);
  }

  public async getJobResult(jobId: string): Promise<Buffer | null> {
    const job = await this.jobQueue.getJob(jobId);
    if (!job || job.status !== 'completed' || !job.result?.audioContent) {
      return null;
    }
    return job.result.audioContent;
  }

  private mapAudioEncoding(encoding: string): any {
    const encodingMap: { [key: string]: any } = {
      MP3: 'MP3',
      WAV: 'LINEAR16',
      OGG_OPUS: 'OGG_OPUS',
    };
    return encodingMap[encoding] || 'MP3';
  }

  private generateCacheKey(text: string, request: SynthesisRequest): string {
    const keyData = {
      text: text.slice(0, 100), // Use first 100 chars
      voice: request.voice,
      audioConfig: request.audioConfig,
    };

    const keyString = JSON.stringify(keyData);
    return Buffer.from(keyString).toString('base64').slice(0, 32);
  }

  public async getUsageStats(
    userId: string,
    timeframe: 'day' | 'week' | 'month' = 'day'
  ): Promise<{
    totalRequests: number;
    totalCharacters: number;
    totalDuration: number;
    avgResponseTime: number;
  }> {
    // Implementation for usage analytics
    // This would typically query a database or analytics service
    return {
      totalRequests: 0,
      totalCharacters: 0,
      totalDuration: 0,
      avgResponseTime: 0,
    };
  }
}
