// This file is intentionally left blank and will be deleted if not needed.

declare module 'elevenlabs-node' {
  export class ElevenLabsClient {
    constructor(config: { apiKey: string });
    textToSpeech(options: {
      voiceId: string;
      text: string;
      modelId?: string;
      outputFormat?: string;
    }): Promise<ArrayBuffer>;
  }
}
