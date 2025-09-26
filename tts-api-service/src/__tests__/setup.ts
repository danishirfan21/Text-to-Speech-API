import { config } from '../config/config';

// Set test environment
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';

// Increase test timeout for TTS operations
jest.setTimeout(30000);

// Mock Google Cloud TTS for tests
jest.mock('@google-cloud/text-to-speech', () => {
  return {
    TextToSpeechClient: jest.fn().mockImplementation(() => ({
      synthesizeSpeech: jest.fn().mockResolvedValue([{
        audioContent: Buffer.from('fake-audio-data')
      }]),
      listVoices: jest.fn().mockResolvedValue([{
        voices: [
          {
            name: 'en-US-Test-Voice',
            languageCodes: ['en-US'],
            ssmlGender: 'NEUTRAL',
            naturalSampleRateHertz: 24000
          }
        ]
      }])
    }))
  };
});
