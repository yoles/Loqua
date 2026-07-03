import type { AudioClip } from './audio-clip.ts';
import type { RuntimeCapability } from './runtime-capability.ts';

export interface WordTiming {
  readonly text: string;
  readonly startMs: number;
  readonly endMs: number;
  readonly confidence?: number;
}

export interface TranscriptionResult {
  readonly text: string;
  readonly words: readonly WordTiming[];
  readonly language: string;
}

export interface TranscriptionPort {
  capability(): RuntimeCapability;
  transcribe(audio: AudioClip, opts?: { language?: string }): Promise<TranscriptionResult>;
}
