// Couture entre le port de transcription et le moteur réel :
// transformers.js (Whisper) en prod navigateur, moteur factice dans les tests.
export interface AsrChunk {
  readonly text: string;
  readonly timestamp: readonly [number, number | null]; // secondes
}

export interface AsrOutput {
  readonly text: string;
  readonly chunks?: readonly AsrChunk[];
}

export interface AsrEngine {
  run(pcm16k: Float32Array, opts: { language: string }): Promise<AsrOutput>;
}

export type AsrDevice = 'webgpu' | 'wasm';

export type AsrEngineFactory = (
  onProgress?: (ratio: number) => void,
) => Promise<{ engine: AsrEngine; device: AsrDevice }>;
