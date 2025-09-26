import request from 'supertest';
import TTSAPIServer from '../../server';
import { connectRedis, closeRedis } from '../../config/redis';

describe('TTS API Integration Tests', () => {
  let app: any;
  let server: TTSAPIServer;
  let authToken: string;

  beforeAll(async () => {
    // Connect to test Redis
    await connectRedis();
    
    // Initialize server
    server = new TTSAPIServer();
    app = server.getApp();

    // Create test user and get token
    const registerResponse = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'test@example.com',
        password: 'Test123!',
        tier: 'premium'
      });

    authToken = registerResponse.body.tokens.accessToken;
  });

  afterAll(async () => {
    await closeRedis();
  });

  describe('POST /api/tts/synthesize', () => {
    it('should synthesize text successfully', async () => {
      const response = await request(app)
        .post('/api/tts/synthesize')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          text: 'Hello, this is a test.',
          voice: {
            languageCode: 'en-US',
            name: 'en-US-Wavenet-D'
          },
          audioConfig: {
            audioEncoding: 'MP3'
          }
        });

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('audio/mpeg');
      expect(response.body).toBeInstanceOf(Buffer);
    });

    it('should create async job for large text', async () => {
      const longText = 'This is a very long text. '.repeat(100);
      
      const response = await request(app)
        .post('/api/tts/synthesize')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          text: longText,
          async: true
        });

      expect(response.status).toBe(202);
      expect(response.body).toHaveProperty('jobId');
      expect(response.body).toHaveProperty('statusUrl');
    });

    it('should validate input parameters', async () => {
      const response = await request(app)
        .post('/api/tts/synthesize')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          text: '', // Empty text should fail
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should respect rate limits', async () => {
      // This would require mocking the rate limiter or using a test user
      // with very low limits for actual rate limit testing
    });
  });

  describe('GET /api/tts/voices', () => {
    it('should return available voices', async () => {
      const response = await request(app)
        .get('/api/tts/voices')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('voices');
      expect(response.body).toHaveProperty('supportedFormats');
    });
  });

  describe('Authentication', () => {
    it('should reject requests without authentication', async () => {
      const response = await request(app)
        .post('/api/tts/synthesize')
        .send({ text: 'Hello world' });

      expect(response.status).toBe(401);
    });

    it('should accept valid API key', async () => {
      // Get user's API key
      const userResponse = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${authToken}`);

      const apiKey = userResponse.body.user.apiKey;

      const response = await request(app)
        .get('/api/tts/voices')
        .set('X-API-Key', apiKey);

      expect(response.status).toBe(200);
    });
  });
});
