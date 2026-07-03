export type ModelTask = 'stt' | 'tts' | 'llm' | 'scoring';

export interface ModelDescriptor {
  readonly id: string;
  readonly task: ModelTask;
  readonly sizeBytes: number;
  readonly checksum: string;
}

export interface ModelRuntimePort {
  list(): ModelDescriptor[];
  isReady(modelId: string): Promise<boolean>;
  download(modelId: string, onProgress: (ratio: number) => void): Promise<void>;
  evict(modelId: string): Promise<void>;
}
