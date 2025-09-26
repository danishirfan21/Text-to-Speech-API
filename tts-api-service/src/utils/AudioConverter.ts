import ffmpeg from 'fluent-ffmpeg';
import { Readable, PassThrough } from 'stream';

export class AudioConverter {
  async convert(
    inputBuffer: Buffer,
    fromFormat: string,
    toFormat: string
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const inputStream = new Readable();
      inputStream.push(inputBuffer);
      inputStream.push(null);

      const outputStream = new PassThrough();
      const chunks: Buffer[] = [];

      outputStream.on('data', (chunk) => chunks.push(chunk));
      outputStream.on('end', () => resolve(Buffer.concat(chunks)));
      outputStream.on('error', reject);

      ffmpeg(inputStream)
        .inputFormat(fromFormat)
        .audioCodec(this.getCodec(toFormat))
        .format(toFormat)
        .on('error', reject)
        .pipe(outputStream);
    });
  }

  private getCodec(format: string): string {
    const codecs: { [key: string]: string } = {
      mp3: 'libmp3lame',
      wav: 'pcm_s16le',
      ogg: 'libvorbis',
    };
    return codecs[format.toLowerCase()] || 'libmp3lame';
  }

  async getDuration(audioBuffer: Buffer): Promise<number> {
    // Implementation would use ffprobe to get audio duration
    // For demo purposes, returning estimated duration
    const estimatedDuration = audioBuffer.length / (44100 * 2 * 2); // Rough estimate
    return Math.max(1, Math.floor(estimatedDuration));
  }

  async trimAudio(
    audioBuffer: Buffer,
    startSeconds: number,
    durationSeconds: number
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const inputStream = new Readable();
      inputStream.push(audioBuffer);
      inputStream.push(null);

      const outputStream = new PassThrough();
      const chunks: Buffer[] = [];

      outputStream.on('data', (chunk) => chunks.push(chunk));
      outputStream.on('end', () => resolve(Buffer.concat(chunks)));
      outputStream.on('error', reject);

      ffmpeg(inputStream)
        .seekInput(startSeconds)
        .duration(durationSeconds)
        .audioCodec('libmp3lame')
        .format('mp3')
        .on('error', reject)
        .pipe(outputStream);
    });
  }
}
