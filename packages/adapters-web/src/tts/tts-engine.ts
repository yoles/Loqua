import type { Variant } from '@loqua/core';

// Couture entre le port de synthèse vocale et le moteur réel : kokoro.js
// (Kokoro-82M) en prod navigateur, moteur factice dans les tests. Le mapping
// variant → voix est un détail du moteur (choix technique kokoro), pas du port.
export interface TtsOutput {
  readonly samples: Float32Array; // PCM mono float32
  readonly sampleRate: number;
}

export interface TtsEngine {
  run(text: string, opts: { variant: Variant; speed: number }): Promise<TtsOutput>;
}

export type TtsDevice = 'webgpu' | 'wasm';

export type TtsEngineFactory = (
  onProgress?: (ratio: number) => void,
) => Promise<{ engine: TtsEngine; device: TtsDevice }>;
