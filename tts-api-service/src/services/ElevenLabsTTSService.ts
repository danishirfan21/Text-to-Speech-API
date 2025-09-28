import { ElevenLabsClient } from 'elevenlabs-node';
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

export class ElevenLabsTTSService {
	private static instance: ElevenLabsTTSService;
	private jobQueue: JobQueue;
	private cacheService: CacheService;
	private textPreprocessor: TextPreprocessor;
	private availableVoices: Voice[] = [];
	private elevenLabs: any;
	private readonly defaultVoiceId = process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL';

	constructor() {
		this.jobQueue = new JobQueue();
		this.cacheService = new CacheService();
		this.textPreprocessor = new TextPreprocessor();
		this.elevenLabs = new ElevenLabsClient({
			apiKey: process.env.ELEVENLABS_API_KEY || '',
		});
		this.initializeVoices();
	}

	public static getInstance(): ElevenLabsTTSService {
		if (!ElevenLabsTTSService.instance) {
			ElevenLabsTTSService.instance = new ElevenLabsTTSService();
		}
		return ElevenLabsTTSService.instance;
	}

	public static async initialize(): Promise<void> {
		const instance = ElevenLabsTTSService.getInstance();
		await instance.jobQueue.initialize();
		logger.info('ElevenLabs TTS Service initialized');
	}

	private initializeVoices(): void {
		this.availableVoices = [
			{
				name: 'Rachel',
				languageCode: 'en-US',
				ssmlGender: 'FEMALE',
				naturalSampleRateHertz: 22050,
				description: 'ElevenLabs - Rachel (default)',
			},
			{
				name: 'Domi',
				languageCode: 'en-US',
				ssmlGender: 'FEMALE',
				naturalSampleRateHertz: 22050,
				description: 'ElevenLabs - Domi',
			},
			{
				name: 'Bella',
				languageCode: 'en-US',
				ssmlGender: 'FEMALE',
				naturalSampleRateHertz: 22050,
				description: 'ElevenLabs - Bella',
			},
			{
				name: 'Antoni',
				languageCode: 'en-US',
				ssmlGender: 'MALE',
				naturalSampleRateHertz: 22050,
				description: 'ElevenLabs - Antoni',
			},
		];
	}

	public getAvailableVoices(): Voice[] {
		return this.availableVoices;
	}

	public async performSynthesis(
		text: string,
		request: SynthesisRequest
	): Promise<Buffer> {
		try {
			let voiceId = this.defaultVoiceId;
			const voiceName = request.voice?.name;
			const voiceMap: Record<string, string> = {
				'Rachel': 'EXAVITQu4vr4xnSDxMaL',
				'Domi': 'AZnzlk1XvdvUeBnXmlld',
				'Bella': 'EXAVITQu4vr4xnSDxMaL', // Replace with actual Bella ID
				'Antoni': 'ErXwobaYiN019PkySvjV',
			};
			if (voiceName && voiceMap[voiceName]) {
				voiceId = voiceMap[voiceName] || this.defaultVoiceId;
			}

			logger.info(`Using ElevenLabs voice: ${voiceId} (${voiceName || 'default'})`);

			const audioBuffer = await this.elevenLabs.textToSpeech({
				voiceId,
				text,
				modelId: 'eleven_monolingual_v1', // or 'eleven_multilingual_v1' for more languages
				outputFormat: 'mp3',
			});

			if (!audioBuffer || audioBuffer.length === 0) {
				throw new Error('No audio content received from ElevenLabs API');
			}

			return Buffer.from(audioBuffer);
		} catch (error: any) {
			logger.error('Synthesis error:', error);
			throw error;
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
			service: 'elevenlabs' // Updated to reflect the removal of Hugging Face references
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
