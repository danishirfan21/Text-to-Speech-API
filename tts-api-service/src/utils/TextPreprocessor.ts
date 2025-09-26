export class TextPreprocessor {
  // URL pattern for detecting URLs
  private urlPattern =
    /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/g;

  // Number patterns
  private numberPatterns = {
    currency: /\$[\d,]+\.?\d*/g,
    percentage: /\d+\.?\d*%/g,
    decimal: /\d+\.\d+/g,
    large: /\d{4,}/g,
    phone: /\b\d{3}-\d{3}-\d{4}\b/g,
  };

  // Abbreviation expansions
  private abbreviations: { [key: string]: string } = {
    'Dr.': 'Doctor',
    'Mr.': 'Mister',
    'Mrs.': 'Missus',
    'Ms.': 'Miss',
    'Prof.': 'Professor',
    'St.': 'Street',
    'Ave.': 'Avenue',
    'Blvd.': 'Boulevard',
    'Rd.': 'Road',
    'etc.': 'et cetera',
    'vs.': 'versus',
    'e.g.': 'for example',
    'i.e.': 'that is',
    API: 'A P I',
    URL: 'U R L',
    HTTP: 'H T T P',
    JSON: 'J S O N',
    XML: 'X M L',
    CSS: 'C S S',
    HTML: 'H T M L',
    JS: 'JavaScript',
    AI: 'A I',
    ML: 'M L',
    CEO: 'C E O',
    CTO: 'C T O',
    UI: 'U I',
    UX: 'U X',
  };

  async process(text: string): Promise<string> {
    let processedText = text;

    // Remove excessive whitespace
    processedText = processedText.replace(/\s+/g, ' ').trim();

    // Handle URLs
    processedText = this.processUrls(processedText);

    // Expand abbreviations
    processedText = this.expandAbbreviations(processedText);

    // Process numbers
    processedText = this.processNumbers(processedText);

    // Handle special characters and symbols
    processedText = this.processSymbols(processedText);

    // Clean up punctuation for better speech synthesis
    processedText = this.normalizePunctuation(processedText);

    return processedText;
  }

  private processUrls(text: string): string {
    return text.replace(this.urlPattern, (url) => {
      // Convert URL to readable format
      const domain = url.replace(/https?:\/\/(www\.)?/, '').split('/')[0];
      return `the website ${domain}`;
    });
  }

  private expandAbbreviations(text: string): string {
    let result = text;

    for (const [abbrev, expansion] of Object.entries(this.abbreviations)) {
      const regex = new RegExp(`\\b${abbrev.replace('.', '\\.')}\\b`, 'gi');
      result = result.replace(regex, expansion);
    }

    return result;
  }

  private processNumbers(text: string): string {
    let result = text;

    // Handle currency
    result = result.replace(this.numberPatterns.currency, (match) => {
      const amount = match.replace('$', '');
      return `${amount} dollars`;
    });

    // Handle percentages
    result = result.replace(this.numberPatterns.percentage, (match) => {
      const number = match.replace('%', '');
      return `${number} percent`;
    });

    // Handle phone numbers
    result = result.replace(this.numberPatterns.phone, (match) => {
      const parts = match.split('-');
      return `${parts[0]} ${parts[1]} ${parts[2]}`;
    });

    // Handle large numbers (add commas for readability)
    result = result.replace(this.numberPatterns.large, (match) => {
      const number = parseInt(match);
      if (number >= 1000000) {
        return `${(number / 1000000).toFixed(1)} million`;
      } else if (number >= 1000) {
        return `${(number / 1000).toFixed(1)} thousand`;
      }
      return match;
    });

    return result;
  }

  private processSymbols(text: string): string {
    const symbolReplacements: { [key: string]: string } = {
      '&': ' and ',
      '@': ' at ',
      '#': ' hash ',
      '%': ' percent ',
      '+': ' plus ',
      '=': ' equals ',
      '<': ' less than ',
      '>': ' greater than ',
      '©': ' copyright ',
      '®': ' registered trademark ',
      '™': ' trademark ',
    };

    let result = text;
    for (const [symbol, replacement] of Object.entries(symbolReplacements)) {
      result = result.replace(new RegExp(`\\${symbol}`, 'g'), replacement);
    }

    return result;
  }

  private normalizePunctuation(text: string): string {
    return (
      text
        // Normalize ellipsis
        .replace(/\.{3,}/g, '...')
        // Normalize multiple exclamation marks
        .replace(/!{2,}/g, '!')
        // Normalize multiple question marks
        .replace(/\?{2,}/g, '?')
        // Add space after punctuation if missing
        .replace(/([.!?])([A-Z])/g, '$1 $2')
        // Remove extra spaces
        .replace(/\s+/g, ' ')
        .trim()
    );
  }

  splitIntoChunks(text: string, maxLength: number = 500): string[] {
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
    const chunks: string[] = [];
    let currentChunk = '';

    for (const sentence of sentences) {
      const trimmedSentence = sentence.trim();
      if (currentChunk.length + trimmedSentence.length + 1 <= maxLength) {
        currentChunk += (currentChunk ? '. ' : '') + trimmedSentence;
      } else {
        if (currentChunk) {
          chunks.push(currentChunk + '.');
        }
        currentChunk = trimmedSentence;
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk + '.');
    }

    return chunks;
  }
}