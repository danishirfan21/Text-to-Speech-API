import { TTSService } from '../../services/TTSService';
import { CacheService } from '../../services/CacheService';

describe('TTSService', () => {
  let ttsService: TTSService;
  let cacheService: CacheService;

  beforeEach(() => {
    ttsService = TTSService.getInstance();
    cacheService = CacheService.getInstance();
  });

  describe('synthesizeText', () => {
    it('should return cached result when available', async () => {
      const cacheKey = 'test-cache-key';
      const cachedBuffer = Buffer.from('cached-audio');
      
      jest.spyOn(cacheService, 'get').mockResolvedValue(cachedBuffer);
      
      const result = await ttsService.synthesizeText({
        text: 'Test text'
      }, 'user123');

      expect(result).toBe(cachedBuffer);
    });

    it('should handle different audio formats', async () => {
      const request = {
        text: 'Test text',
        audioConfig: {
          audioEncoding: 'WAV' as const
        }
      };

      const result = await ttsService.synthesizeText(request, 'user123');
      expect(Buffer.isBuffer(result)).toBe(true);
    });

    it('should split long text into chunks for streaming', async () => {
      const longText = 'This is a sentence. '.repeat(50);
      
      const result = await ttsService.synthesizeText({
        text: longText,
        streaming: true
      }, 'user123');

      expect(Buffer.isBuffer(result)).toBe(true);
    });
  });

  describe('getAvailableVoices', () => {
    it('should return list of voices', () => {
      const voices = ttsService.getAvailableVoices();
      expect(Array.isArray(voices)).toBe(true);
      expect(voices.length).toBeGreaterThan(0);
    });
  });
});
