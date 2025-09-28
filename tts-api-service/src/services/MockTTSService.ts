import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { SynthesisRequest, SynthesisJob, Voice } from './ElevenLabsTTSService';

export class MockTTSService {
  private static instance: MockTTSService;

  public static getInstance(): MockTTSService {
    if (!MockTTSService.instance) {
      MockTTSService.instance = new MockTTSService();
    }
    return MockTTSService.instance;
  }

  public static async initialize(): Promise<void> {
    logger.info('Mock TTS Service initialized');
  }

  public getAvailableVoices(): Voice[] {
    return [
      {
        name: 'Mock-Voice-Female',
        languageCode: 'en-US',
        ssmlGender: 'FEMALE',
        naturalSampleRateHertz: 22050,
        description: 'Mock Female Voice for Testing',
      },
      {
        name: 'Mock-Voice-Male',
        languageCode: 'en-US',
        ssmlGender: 'MALE',
        naturalSampleRateHertz: 22050,
        description: 'Mock Male Voice for Testing',
      },
    ];
  }

  public async synthesizeText(
    request: SynthesisRequest,
    userId: string
  ): Promise<SynthesisJob | Buffer> {
    logger.info('Mock TTS: Synthesizing text', { textLength: request.text.length, userId });

    if (request.async) {
      const job: SynthesisJob = {
        id: uuidv4(),
        status: 'completed',
        progress: 100,
        request,
        result: {
          audioUrl: `/api/tts/download/mock-${Date.now()}`,
          audioContent: this.generateMockAudio(request.text),
          duration: Math.ceil(request.text.length / 10), // ~10 chars per second
          size: request.text.length * 100, // Rough estimate
        },
        createdAt: new Date(),
        completedAt: new Date(),
      };
      return job;
    }

    // Return mock audio immediately
    return this.generateMockAudio(request.text);
  }

  private generateMockAudio(text: string): Buffer {
    // Create realistic-sized audio buffer
    const audioSize = Math.max(8192, text.length * 100); // Minimum 8KB
    const mockAudio = Buffer.alloc(audioSize);
    
    // Fill with pseudo-audio data
    for (let i = 0; i < audioSize; i++) {
      mockAudio[i] = Math.sin(i * 0.01 * text.length) * 127 + 128;
    }
    
    return mockAudio;
  }

  public async getJobStatus(jobId: string): Promise<SynthesisJob | null> {
    // Mock completed job
    return {
      id: jobId,
      status: 'completed',
      progress: 100,
      request: { text: 'Mock request' },
      result: {
        audioUrl: `/api/tts/download/${jobId}`,
        duration: 5,
        size: 10240,
      },
      createdAt: new Date(),
      completedAt: new Date(),
    };
  }

  public async getJobResult(jobId: string): Promise<Buffer | null> {
    return this.generateMockAudio('Mock job result');
  }

  public async getUsageStats(userId: string): Promise<any> {
    return {
      totalRequests: 42,
      totalCharacters: 1337,
      totalDuration: 180,
      avgResponseTime: 1.2,
    };
  }
}
