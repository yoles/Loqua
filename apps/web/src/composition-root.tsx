'use client';

// COMPOSITION ROOT de l'app web (ARCHITECTURE §5, §20) : le SEUL endroit qui
// instancie les adapters et les injecte dans le core. Aucune feature n'importe
// un adapter directement ; tout consommateur passe par le Provider.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import {
  attachErrorCardCreation,
  attachGamification,
  createEgressGuard,
  createEventBus,
  createPipelineRunner,
  createReviewDeck,
  makeConsent,
  GAMIFICATION_COLLECTION,
  INITIAL_PIPELINE_STATE,
  type ClockPort,
  type GamificationState,
  type PipelineRunner,
  type PipelineState,
  type ReadySession,
  type ReviewDeck,
  type StoragePort,
} from '@loqua/core';
import {
  createCloudCorrectionPort,
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
  CorrectionPort,
  PhonemizerPort,
  SpeechSynthesisPort,
  TranscriptionPort,
} from '@loqua/core';
import type { SessionRecord } from '@/entities/session/record';

const CORRECTION_ENDPOINT =
  process.env['NEXT_PUBLIC_CORRECTION_API'] ?? 'http://localhost:8787/v1/correction';
// Worker statique (public/) : SQLite y vit car OPFS est interdit sur le thread
// principal ; la dist sqlite-wasm est copiée à côté par copy-sqlite-wasm.mjs.
const SQLITE_WORKER_URL = '/sqlite-worker.mjs';

interface OpenedStorage {
  readonly storage: StoragePort;
  readonly persistent: boolean;
  close(): void;
}

// Même frontend web↔desktop (Spike #3) : seul l'adapter storage change selon le
// runtime. Imports dynamiques pour ne charger que l'adapter de la plateforme.
async function openStorageForRuntime(): Promise<OpenedStorage> {
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

const systemClock: ClockPort = {
  now: () => Date.now(),
  timezone: () => Intl.DateTimeFormat().resolvedOptions().timeZone,
};

// Desktop : correction LOCALE par défaut (100 % local, positionnement) ; le cloud
// reste un opt-in EXPLICITE (invariant #5, jamais silencieux). Routage au
// composition root — le core ne reçoit qu'un seul CorrectionPort.
function routeCorrection(
  local: CorrectionPort,
  cloud: CorrectionPort,
  useCloud: () => boolean,
): CorrectionPort {
  return {
    capability: () => (useCloud() ? cloud : local).capability(),
    correct: (input) => (useCloud() ? cloud : local).correct(input),
  };
}

export interface CorrectionApp {
  readonly state: PipelineState;
  readonly runner: PipelineRunner;
  readonly speechSynthesis: SpeechSynthesisPort | null; // null = TTS local indispo (repli WebSpeech)
  readonly phonemizer: PhonemizerPort | null; // null = phonémisation indispo (desktop en attendant)
  readonly downloadProgress: number | null; // 0..1 pendant le download du modèle STT
  readonly sttTier: string;
  readonly microphoneConsent: boolean;
  readonly cloudCorrection: boolean;
  readonly sessions: readonly SessionRecord[];
  readonly storagePersistent: boolean | null; // null = stockage indisponible
  readonly review: ReviewDeck | null; // null tant que le stockage n'est pas prêt
  readonly cardsVersion: number; // s'incrémente quand le deck a pu changer
  readonly gamification: GamificationState | null;
  grantMicrophone(): void;
  setCloudCorrection(enabled: boolean): void;
  eraseAll(): Promise<void>;
}

function useCorrectionAppInternal(): CorrectionApp {
  const [state, setState] = useState<PipelineState>(INITIAL_PIPELINE_STATE);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [microphoneConsent, setMicrophoneConsent] = useState(false);
  const [cloudCorrection, setCloudCorrectionState] = useState(false);
  const [sessions, setSessions] = useState<readonly SessionRecord[]>([]);
  const [storagePersistent, setStoragePersistent] = useState<boolean | null>(null);
  const [review, setReview] = useState<ReviewDeck | null>(null);
  const [cardsVersion, setCardsVersion] = useState(0);
  const [gamification, setGamification] = useState<GamificationState | null>(null);
  const cloudOptInRef = useRef(false);
  const storageRef = useRef<StoragePort | null>(null);

  const app = useMemo(() => {
    const bus = createEventBus();
    const guard = createEgressGuard(bus, null);

    const onDownloadProgress = (ratio: number): void => {
      setDownloadProgress(ratio >= 1 ? null : ratio);
    };
    const cloudCorrection = createCloudCorrectionPort({
      endpoint: CORRECTION_ENDPOINT,
      guard,
      cloudOptIn: () => cloudOptInRef.current,
    });

    // Même frontend web↔desktop : seuls les adapters injectés changent (Spike #3).
    let transcription: TranscriptionPort;
    let correction: CorrectionPort;
    if (isTauriRuntime()) {
      // Desktop : STT + correction natifs (audio ET texte restent sur l'appareil).
      const modelRuntime = createTauriModelRuntime({ invoke: tauriInvoke });
      transcription = createTauriTranscriptionPort({
        invoke: tauriInvoke,
        modelRuntime,
        decodeToPcm16k,
        onDownloadProgress,
      });
      const localCorrection = createTauriCorrectionPort({
        invoke: tauriInvoke,
        modelRuntime,
        onDownloadProgress,
      });
      correction = routeCorrection(localCorrection, cloudCorrection, () => cloudOptInRef.current);
    } else {
      // Web « lite » : STT local WASM/WebGPU ; correction = cloud-ZDR opt-in.
      transcription = createWhisperTranscriptionPort({
        engineFactory: createTransformersAsrEngineFactory(),
        onDownloadProgress,
      });
      correction = cloudCorrection;
    }

    // TTS local (lot 5.1) : web = kokoro.js. Desktop natif = incrément suivant ;
    // en attendant le port est null et le feature read-aloud replie sur WebSpeech.
    const speechSynthesis: SpeechSynthesisPort | null = isTauriRuntime()
      ? null
      : createKokoroSpeechSynthesisPort({
          engineFactory: createKokoroTtsEngineFactory(),
          onDownloadProgress,
        });
    // Phonémisation IPA (lot 5.2) : web = kokoro-js/eSpeak ; desktop natif à venir.
    const phonemizer: PhonemizerPort | null = isTauriRuntime()
      ? null
      : createKokoroPhonemizerPort();

    const runner = createPipelineRunner({
      transcription,
      correction,
      variant: 'en-US',
      onState: setState,
      onReady: (session: ReadySession) => {
        void persistSession(session);
      },
      events: bus,
    });

    async function persistSession(session: ReadySession): Promise<void> {
      const record: SessionRecord = {
        id: `${session.clipId}-${Date.now()}`,
        createdAtMs: Date.now(),
        variant: session.state.correction.variant,
        originalText: session.transcription.text,
        correctedText: session.correction.correctedText,
        corrections: session.state.correction.corrections,
        qualityTier: session.state.correction.qualityTier,
      };
      setSessions((current) => [record, ...current]);
      await storageRef.current?.put('sessions', record.id, record);
    }

    return { bus, runner, transcription, speechSynthesis, phonemizer };
  }, []);

  // Stockage : sqlite-wasm chargé hors bundler, OPFS si dispo — état TOUJOURS visible.
  useEffect(() => {
    let cancelled = false;
    const detachers: (() => void)[] = [];
    (async () => {
      try {
        const opened = await openStorageForRuntime();
        if (cancelled) {
          opened.close();
          return;
        }
        const storage = opened.storage;
        storageRef.current = storage;
        setStoragePersistent(opened.persistent);

        const errorCards = attachErrorCardCreation(app.bus, { storage, clock: systemClock });
        const gamificationPolicy = attachGamification(app.bus, { storage, clock: systemClock });
        detachers.push(errorCards.detach, gamificationPolicy.detach);
        setReview(createReviewDeck({ storage, clock: systemClock, events: app.bus }));

        const reloadGamification = async (): Promise<void> => {
          await gamificationPolicy.settled();
          const state = await storage.read<GamificationState>(GAMIFICATION_COLLECTION, 'state');
          if (!cancelled) {
            setGamification(state);
          }
        };
        const reloadCards = async (): Promise<void> => {
          await errorCards.settled();
          if (!cancelled) {
            setCardsVersion((version) => version + 1);
          }
        };
        detachers.push(
          app.bus.subscribe('ErrorDetected', () => void reloadCards()),
          app.bus.subscribe('SessionCompleted', () => void reloadGamification()),
          app.bus.subscribe('CardReviewed', () => void reloadGamification()),
        );
        void reloadGamification();

        const stored = await storage.query<SessionRecord>('sessions', {});
        if (!cancelled) {
          setSessions([...stored].sort((a, b) => b.createdAtMs - a.createdAtMs));
        }
      } catch {
        if (!cancelled) {
          setStoragePersistent(null); // indisponible — l'UI l'affiche, pas de silencieux
        }
      }
    })();
    return () => {
      cancelled = true;
      for (const detach of detachers) {
        detach();
      }
    };
  }, [app.bus]);

  const eraseAll = useCallback(async () => {
    await storageRef.current?.eraseAll();
    setSessions([]);
    setGamification(null);
    setCardsVersion((version) => version + 1);
  }, []);

  const publishConsent = useCallback(
    (microphone: boolean, cloudTextProcessing: boolean) => {
      app.bus.publish({
        kind: 'ConsentChanged',
        consent: makeConsent({ microphone, cloudTextProcessing, decidedAtMs: Date.now() }),
      });
    },
    [app.bus],
  );

  const grantMicrophone = useCallback(() => {
    setMicrophoneConsent(true);
    publishConsent(true, cloudOptInRef.current);
  }, [publishConsent]);

  const setCloudCorrection = useCallback(
    (enabled: boolean) => {
      cloudOptInRef.current = enabled;
      setCloudCorrectionState(enabled);
      publishConsent(true, enabled);
    },
    [publishConsent],
  );

  return {
    state,
    runner: app.runner,
    speechSynthesis: app.speechSynthesis,
    phonemizer: app.phonemizer,
    downloadProgress,
    sttTier: app.transcription.capability().qualityTier,
    microphoneConsent,
    cloudCorrection,
    sessions,
    storagePersistent,
    review,
    cardsVersion,
    gamification,
    grantMicrophone,
    setCloudCorrection,
    eraseAll,
  };
}

const CorrectionAppContext = createContext<CorrectionApp | null>(null);

export function CorrectionAppProvider({ children }: { children: ReactNode }) {
  const app = useCorrectionAppInternal();
  return <CorrectionAppContext.Provider value={app}>{children}</CorrectionAppContext.Provider>;
}
CorrectionAppProvider.displayName = 'CorrectionAppProvider';

export function useCorrectionApp(): CorrectionApp {
  const app = useContext(CorrectionAppContext);
  if (app === null) {
    throw new Error('useCorrectionApp must be used inside CorrectionAppProvider');
  }
  return app;
}
