import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { CacheService } from './CacheService';
import { JobQueue } from './JobQueue';
import { TextPreprocessor } from '../utils/TextPreprocessor';

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

export class HuggingFaceTTSService {
  private static instance: HuggingFaceTTSService;
  private jobQueue: JobQueue;
  private cacheService: CacheService;
  private textPreprocessor: TextPreprocessor;
  private availableVoices: Voice[] = [];
  
  // Hugging Face API configuration
  private readonly hfApiKey = process.env.HUGGINGFACE_API_KEY; // Optional, works without it
  private readonly hfApiUrl = 'https://api-inference.huggingface.co/models';
  
  // Available models - free to use!
  private readonly models = {
    'en-US-female': 'microsoft/speecht5_tts',
    'en-US-male': 'facebook/fastspeech2-en-ljspeech', 
    'multilingual': 'espnet/kan-bayashi_ljspeech_vits',
    'coqui-tts': 'coqui/XTTS-v2' // High quality model
  };

  constructor() {
    this.jobQueue = new JobQueue();
    this.cacheService = new CacheService();
    this.textPreprocessor = new TextPreprocessor();
    this.initializeVoices();
  }

  public static getInstance(): HuggingFaceTTSService {
    if (!HuggingFaceTTSService.instance) {
      HuggingFaceTTSService.instance = new HuggingFaceTTSService();
    }
    return HuggingFaceTTSService.instance;
  }

  public static async initialize(): Promise<void> {
    const instance = HuggingFaceTTSService.getInstance();
    await instance.jobQueue.initialize();
    logger.info('Hugging Face TTS Service initialized');
  }

  private initializeVoices(): void {
    this.availableVoices = [
      {
        name: 'en-US-SpeechT5-Female',
        languageCode: 'en-US',
        ssmlGender: 'FEMALE',
        naturalSampleRateHertz: 22050,
        description: 'US English - Female (SpeechT5)',
      },
      {
        name: 'en-US-FastSpeech2-Male',
        languageCode: 'en-US', 
        ssmlGender: 'MALE',
        naturalSampleRateHertz: 22050,
        description: 'US English - Male (FastSpeech2)',
      },
      {
        name: 'multilingual-VITS',
        languageCode: 'en-US',
        ssmlGender: 'NEUTRAL',
        naturalSampleRateHertz: 22050,
        description: 'Multilingual - Neutral (VITS)',
      },
      {
        name: 'en-US-XTTS-High',
        languageCode: 'en-US',
        ssmlGender: 'NEUTRAL', 
        naturalSampleRateHertz: 24000,
        description: 'US English - High Quality (XTTS-v2)',
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
      await this.cacheService.set(cacheKey, audioBuffer, 3600);

      return audioBuffer;
    } catch (error: any) {
      logger.error('Text synthesis failed:', error);
      throw new Error(`Synthesis failed: ${error.message}`);
    }
  }

  private async performSynthesis(
    text: string,
    request: SynthesisRequest
  ): Promise<Buffer> {
    try {
      // Select model based on voice preference
      const voiceName = request.voice?.name || 'en-US-SpeechT5-Female';
      let modelName = this.models['en-US-female']; // default
      
      if (voiceName.includes('Male') || voiceName.includes('MALE')) {
        modelName = this.models['en-US-male'];
      } else if (voiceName.includes('XTTS')) {
        modelName = this.models['coqui-tts'];
      } else if (voiceName.includes('multilingual')) {
        modelName = this.models['multilingual'];
      }

      logger.info(`Using TTS model: ${modelName} for voice: ${voiceName}`);

      // Call Hugging Face Inference API
      const response = await this.callHuggingFaceAPI(modelName, text);
      
      if (!response || (response as ArrayBuffer).byteLength === 0) {
        throw new Error('No audio content received from Hugging Face API');
      }

      return Buffer.from(response as ArrayBuffer);

    } catch (error: any) {
      logger.error('Synthesis error:', error);
      
      // Fallback to mock audio for demo purposes
      if (error.message && (error.message.includes('rate limit') || error.message.includes('model loading'))) {
        logger.warn('Using fallback mock audio due to API limitations');
        return this.generateMockAudio(text);
      }
      
      throw error;
    }
  }

  private async callHuggingFaceAPI(modelName: string, text: string): Promise<ArrayBuffer> {
    const headers: any = {
      'Content-Type': 'application/json',
    };

    // Add API key if available (optional - works without it)
    if (this.hfApiKey) {
      headers['Authorization'] = `Bearer ${this.hfApiKey}`;
    }

    try {
      const response = await axios.post(
        `${this.hfApiUrl}/${modelName}`,
        { 
          inputs: text,
          parameters: {
            // Optional parameters for better quality
            max_length: 1000,
            do_sample: true,
            temperature: 0.7
          }
        },
        {
          headers,
          responseType: 'arraybuffer',
          timeout: 30000, // 30 second timeout
        }
      );

      return response.data;

    } catch (error: any) {
      if (error.response?.status === 503) {
        // Model is loading, wait a bit and retry
        logger.info('Model loading, waiting 10 seconds...');
        await new Promise(resolve => setTimeout(resolve, 10000));
        
        // Retry once
        const retryResponse = await axios.post(
          `${this.hfApiUrl}/${modelName}`,
          { inputs: text },
          { headers, responseType: 'arraybuffer', timeout: 30000 }
        );
        
        return retryResponse.data;
      }
      
      throw new Error(`Hugging Face API error: ${error.response?.status} - ${error.message}`);
    }
  }

  private async synthesizeStreaming(
    text: string,
    request: SynthesisRequest,
    cacheKey: string
  ): Promise<Buffer> {
    // Split into smaller chunks for streaming
    const chunks = this.textPreprocessor.splitIntoChunks(text, 200); // Smaller chunks for HF API
    const audioChunks: Buffer[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i] ?? '';
      logger.info(`Processing chunk ${i + 1}/${chunks.length}`);
      
      const chunkBuffer = await this.performSynthesis(chunk, request);
      audioChunks.push(chunkBuffer);
      
      // Small delay to avoid rate limiting
      if (i < chunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // Concatenate all audio chunks
    const finalBuffer = Buffer.concat(audioChunks);
    
    // Cache the complete result
    await this.cacheService.set(cacheKey, finalBuffer, 3600);
    
    return finalBuffer;
  }

  // Fallback mock audio for when API is unavailable
  private generateMockAudio(text: string): Buffer {
    // Generate a simple audio-like buffer for demo purposes
    // In a real scenario, you could use a local TTS engine like espeak
    const mockAudioData = Buffer.alloc(8192); // 8KB mock audio
    
    // Fill with some audio-like data based on text length
    for (let i = 0; i < mockAudioData.length; i++) {
      mockAudioData[i] = Math.sin(i * 0.1 * text.length) * 127 + 128;
    }
    
    logger.info('Generated mock audio for demonstration');
    return mockAudioData;
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

  private generateCacheKey(text: string, request: SynthesisRequest): string {
    const keyData = {
      text: text.slice(0, 100),
      voice: request.voice,
      audioConfig: request.audioConfig,
      service: 'huggingface'
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
    return {
      totalRequests: 0,
      totalCharacters: 0, 
      totalDuration: 0,
      avgResponseTime: 0,
    };
  }
}
