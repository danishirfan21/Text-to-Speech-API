import { TextPreprocessor } from '../../utils/TextPreprocessor';

describe('TextPreprocessor', () => {
  let processor: TextPreprocessor;

  beforeEach(() => {
    processor = new TextPreprocessor();
  });

  describe('process', () => {
    it('should expand common abbreviations', async () => {
      const input = 'Dr. Smith lives on Main St.';
      const result = await processor.process(input);
      expect(result).toBe('Doctor Smith lives on Main Street');
    });

    it('should handle URLs properly', async () => {
      const input = 'Visit https://www.example.com for more info';
      const result = await processor.process(input);
      expect(result).toContain('the website example.com');
    });

    it('should convert numbers to readable format', async () => {
      const input = 'The price is $1,234.56';
      const result = await processor.process(input);
      expect(result).toContain('1234.56 dollars');
    });

    it('should handle percentages', async () => {
      const input = 'Success rate is 99.5%';
      const result = await processor.process(input);
      expect(result).toContain('99.5 percent');
    });
  });

  describe('splitIntoChunks', () => {
    it('should split long text into reasonable chunks', () => {
      const longText = 'This is sentence one. This is sentence two. This is sentence three.';
      const chunks = processor.splitIntoChunks(longText, 50);
      
      expect(chunks.length).toBeGreaterThan(1);
      chunks.forEach(chunk => {
        expect(chunk.length).toBeLessThanOrEqual(50);
      });
    });
  });
});