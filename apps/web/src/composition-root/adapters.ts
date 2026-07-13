// Sélection et assemblage des adapters par plateforme (Spike #3) : même
// frontend web↔desktop, seuls les adapters injectés changent.
import {
  createCloudCorrectionPort,
  createEarCompareScoringPort,
  createKokoroPhonemizerPort,
  createKokoroSpeechSynthesisPort,
  createKokoroTtsEngineFactory,
  createSqliteStoragePort,
  createTransformersAsrEngineFactory,
  createWhisperTranscriptionPort,
  decodeToPcm16k,
} from '@loqua/adapters-web';
import {
  createTauriCorrectionPort,
  createTauriModelRuntime,
  createTauriTranscriptionPort,
  isTauriRuntime,
  tauriInvoke,
} from '@loqua/adapters-tauri';
import type {
  ClockPort,
  CorrectionPort,
  EgressGuard,
  FailureRecoveryProbe,
  PhonemizerPort,
  PronunciationScoringPort,
  SpeechSynthesisPort,
  StoragePort,
  TranscriptionPort,
} from '@loqua/core';

const CORRECTION_ENDPOINT =
  process.env['NEXT_PUBLIC_CORRECTION_API'] ?? 'http://localhost:8787/v1/correction';
// Worker statique (public/) : SQLite y vit car OPFS est interdit sur le thread
// principal ; la dist sqlite-wasm est copiée à côté par copy-sqlite-wasm.mjs.
const SQLITE_WORKER_URL = '/sqlite-worker.mjs';

export const systemClock: ClockPort = {
  now: () => Date.now(),
  timezone: () => Intl.DateTimeFormat().resolvedOptions().timeZone,
};

export interface OpenedStorage {
  readonly storage: StoragePort;
  readonly persistent: boolean;
  close(): void;
}

// Imports dynamiques pour ne charger que l'adapter storage de la plateforme.
export async function openStorageForRuntime(): Promise<OpenedStorage> {
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    const { createTauriSqliteStoragePort, tauriInvoke } = await import('@loqua/adapters-tauri');
    return {
      storage: createTauriSqliteStoragePort(tauriInvoke),
      persistent: true,
      close: () => {},
    };
  }
  const { openWorkerSqliteDatabase } = await import('@loqua/adapters-web/sqlite');
  const db = await openWorkerSqliteDatabase(new Worker(SQLITE_WORKER_URL, { type: 'module' }));
  const storage = await createSqliteStoragePort(db.executor);
  return { storage, persistent: db.persistent, close: db.close };
}

// Desktop : correction LOCALE par défaut (100 % local, positionnement) ; le cloud
// reste un opt-in EXPLICITE (invariant #5, jamais silencieux). Routage au
// composition root — le core ne reçoit qu'un seul CorrectionPort.
function routeCorrection(
  local: CorrectionPort,
  cloud: CorrectionPort,
  shouldUseCloud: () => boolean,
): CorrectionPort {
  return {
    capability: () => (shouldUseCloud() ? cloud : local).capability(),
    correct: (input) => (shouldUseCloud() ? cloud : local).correct(input),
  };
}

export interface PipelinePorts {
  readonly transcription: TranscriptionPort;
  readonly correction: CorrectionPort;
  readonly speechSynthesis: SpeechSynthesisPort;
  readonly phonemizer: PhonemizerPort;
  readonly scoring: PronunciationScoringPort;
}

interface PortFactoryOptions {
  readonly guard: EgressGuard;
  readonly cloudOptIn: () => boolean;
  readonly onDownloadProgress: (ratio: number) => void;
}

// Desktop : STT + correction natifs (audio ET texte restent sur l'appareil).
function buildDesktopSttAndCorrection(
  cloudCorrection: CorrectionPort,
  options: PortFactoryOptions,
): Pick<PipelinePorts, 'transcription' | 'correction'> {
  const modelRuntime = createTauriModelRuntime({ invoke: tauriInvoke });
  const localCorrection = createTauriCorrectionPort({
    invoke: tauriInvoke,
    modelRuntime,
    onDownloadProgress: options.onDownloadProgress,
  });
  return {
    transcription: createTauriTranscriptionPort({
      invoke: tauriInvoke,
      modelRuntime,
      decodeToPcm16k,
      onDownloadProgress: options.onDownloadProgress,
    }),
    correction: routeCorrection(localCorrection, cloudCorrection, options.cloudOptIn),
  };
}

// Web « lite » : STT local WASM/WebGPU ; correction = cloud-ZDR opt-in.
function buildWebSttAndCorrection(
  cloudCorrection: CorrectionPort,
  options: PortFactoryOptions,
): Pick<PipelinePorts, 'transcription' | 'correction'> {
  return {
    transcription: createWhisperTranscriptionPort({
      engineFactory: createTransformersAsrEngineFactory(),
      onDownloadProgress: options.onDownloadProgress,
    }),
    correction: cloudCorrection,
  };
}

export function buildPipelinePorts(options: PortFactoryOptions): PipelinePorts {
  const cloudCorrection = createCloudCorrectionPort({
    endpoint: CORRECTION_ENDPOINT,
    guard: options.guard,
    cloudOptIn: options.cloudOptIn,
  });
  const sttAndCorrection = isTauriRuntime()
    ? buildDesktopSttAndCorrection(cloudCorrection, options)
    : buildWebSttAndCorrection(cloudCorrection, options);
  return {
    ...sttAndCorrection,
    // TTS local (lot 5.1) : kokoro.js (onnxruntime-web/WASM) sur web ET desktop.
    // Le webview Tauri (WebKitGTK) n'expose pas de WebSpeech utilisable ; l'audio
    // reste sur l'appareil (invariant #1), le tier reste VISIBLE (#5).
    speechSynthesis: createKokoroSpeechSynthesisPort({
      engineFactory: createKokoroTtsEngineFactory(),
      onDownloadProgress: options.onDownloadProgress,
    }),
    phonemizer: createKokoroPhonemizerPort(),
    scoring: createEarCompareScoringPort(),
  };
}

// Sondes de recovery (failure-policy du core) : elles DÉCRIVENT quels chemins
// existent sur cette plateforme ; la décision reste dans le core.
// Le desktop masque l'opt-in cloud (positionnement 100 % local) : y proposer
// l'opt-in n'aurait aucune UI, la sonde le reflète honnêtement.
export function buildRecoveryProbe(cloudOptIn: () => boolean): FailureRecoveryProbe {
  return {
    canDegradeToLocal: () => isTauriRuntime() && cloudOptIn(),
    canOfferCloudOptIn: () => !isTauriRuntime() && !cloudOptIn(),
  };
}
