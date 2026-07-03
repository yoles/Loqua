export type AudioFormat = 'wav' | 'webm' | 'pcm';

export interface AudioClip {
  readonly id: string; // hash du contenu → mémoïsation/idempotence
  readonly format: AudioFormat;
  readonly sampleRate: number;
  readonly data: ArrayBuffer; // reste LOCAL — ne franchit jamais un adapter réseau
  readonly durationMs: number;
}
