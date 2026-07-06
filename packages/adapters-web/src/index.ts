export { createCloudCorrectionPort } from './correction/cloud-correction-port.ts';
export {
  correctionPayloadSchema,
  type CorrectionPayload,
} from './correction/correction-schema.ts';
export { WEB_MODEL_REGISTRY, findModel, type WebModelEntry } from './models/registry.ts';
export { createEarCompareScoringPort } from './pronunciation/ear-compare-scoring-port.ts';
export { createWebModelRuntime, type ModelLoader } from './models/web-model-runtime.ts';
export type {
  AsrDevice,
  AsrEngine,
  AsrEngineFactory,
  AsrOutput,
} from './stt/asr-engine.ts';
export { decodeToPcm16k, resampleLinear } from './stt/audio-decode.ts';
export { createTransformersAsrEngineFactory } from './stt/transformers-asr-engine.ts';
export { createWhisperTranscriptionPort } from './stt/whisper-transcription-port.ts';
export { createKokoroPhonemizerPort } from './tts/kokoro-phonemizer-port.ts';
export { createKokoroSpeechSynthesisPort } from './tts/kokoro-speech-synthesis-port.ts';
export { createKokoroTtsEngineFactory } from './tts/kokoro-tts-engine.ts';
export type { TtsDevice, TtsEngine, TtsEngineFactory, TtsOutput } from './tts/tts-engine.ts';
// NB : openWorkerSqliteDatabase (worker sqlite-wasm/OPFS) est exposé via le
// sous-export '@loqua/adapters-web/sqlite' — à ne tirer que là où on l'utilise.
export {
  type SqliteExecutor,
  type SqliteParam,
  type SqliteRow,
} from './storage/sqlite-executor.ts';
export { createSqliteStoragePort } from './storage/sqlite-storage-port.ts';
