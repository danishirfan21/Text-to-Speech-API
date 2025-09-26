import { config } from '../config/config';
import { TTSService } from './TTSService';
import { HuggingFaceTTSService } from './HuggingFaceTTSService';
import { MockTTSService } from './MockTTSService';

export type TTSProvider = 'google' | 'huggingface' | 'mock';

export class TTSServiceFactory {
  public static createTTSService(provider?: TTSProvider) {
    const selectedProvider = provider || config.tts.provider || 'huggingface';
    
    switch (selectedProvider) {
      case 'google':
        return TTSService.getInstance();
      case 'huggingface':
        return HuggingFaceTTSService.getInstance();
      case 'mock':
        return MockTTSService.getInstance();
      default:
        return HuggingFaceTTSService.getInstance();
    }
  }
}
