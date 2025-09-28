import { config } from '../config/config';
import { TTSService } from './TTSService';
import { ElevenLabsTTSService } from './ElevenLabsTTSService';
import { MockTTSService } from './MockTTSService';

export type TTSProvider = 'google' | 'huggingface' | 'mock';

export class TTSServiceFactory {
  public static createTTSService(provider?: TTSProvider) {
    const selectedProvider = provider || config.tts.provider || 'huggingface';
    
    switch (selectedProvider) {
      case 'google':
        return TTSService.getInstance();
      case 'huggingface':
        return ElevenLabsTTSService.getInstance();
      case 'mock':
        return MockTTSService.getInstance();
      default:
        return ElevenLabsTTSService.getInstance();
    }
  }
}
