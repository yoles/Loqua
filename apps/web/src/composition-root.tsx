'use client';

// COMPOSITION ROOT de l'app web (ARCHITECTURE §5, §20) : le SEUL endroit qui
// instancie les adapters et les injecte dans le core. Aucune feature n'importe
// un adapter directement.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  attachErrorCardCreation,
  attachGamification,
  createEgressGuard,
  createEventBus,
  createPipelineRunner,
  makeConsent,
  INITIAL_PIPELINE_STATE,
  type ClockPort,
  type PipelineRunner,
  type PipelineState,
  type ReadySession,
  type StoragePort,
} from '@loqua/core';
import {
  createCloudCorrectionPort,
  createSqliteStoragePort,
  createTransformersAsrEngineFactory,
  createWhisperTranscriptionPort,
} from '@loqua/adapters-web';
import type { Sqlite3InitModule } from '@loqua/adapters-web/sqlite';

import type { SessionRecord } from '@/entities/session/record';

const CORRECTION_ENDPOINT =
  process.env['NEXT_PUBLIC_CORRECTION_API'] ?? 'http://localhost:8787/v1/correction';
// Servi en statique (scripts/copy-sqlite-wasm.mjs) et importé NATIVEMENT au
// runtime : le worker OPFS interne de sqlite-wasm ne passe pas par le bundler.
const SQLITE_RUNTIME_URL = '/sqlite-wasm/index.mjs';

const systemClock: ClockPort = {
  now: () => Date.now(),
  timezone: () => Intl.DateTimeFormat().resolvedOptions().timeZone,
};

export interface CorrectionApp {
  readonly state: PipelineState;
  readonly runner: PipelineRunner;
  readonly downloadProgress: number | null; // 0..1 pendant le download du modèle STT
  readonly sttTier: string;
  readonly microphoneConsent: boolean;
  readonly cloudCorrection: boolean;
  readonly sessions: readonly SessionRecord[];
  readonly storagePersistent: boolean | null; // null = stockage indisponible
  grantMicrophone(): void;
  setCloudCorrection(enabled: boolean): void;
  eraseAll(): Promise<void>;
}

export function useCorrectionApp(): CorrectionApp {
  const [state, setState] = useState<PipelineState>(INITIAL_PIPELINE_STATE);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [microphoneConsent, setMicrophoneConsent] = useState(false);
  const [cloudCorrection, setCloudCorrectionState] = useState(false);
  const [sessions, setSessions] = useState<readonly SessionRecord[]>([]);
  const [storagePersistent, setStoragePersistent] = useState<boolean | null>(null);
  const cloudOptInRef = useRef(false);
  const storageRef = useRef<StoragePort | null>(null);

  const app = useMemo(() => {
    const bus = createEventBus();
    const guard = createEgressGuard(bus, null);

    const transcription = createWhisperTranscriptionPort({
      engineFactory: createTransformersAsrEngineFactory(),
      onDownloadProgress: (ratio) => {
        setDownloadProgress(ratio >= 1 ? null : ratio);
      },
    });

    const correction = createCloudCorrectionPort({
      endpoint: CORRECTION_ENDPOINT,
      guard,
      cloudOptIn: () => cloudOptInRef.current,
    });

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

    return { bus, runner, transcription };
  }, []);

  // Stockage : sqlite-wasm chargé hors bundler, OPFS si dispo — état TOUJOURS visible.
  useEffect(() => {
    let cancelled = false;
    let detachErrorCards: (() => void) | null = null;
    let detachGamification: (() => void) | null = null;
    (async () => {
      try {
        const { openSqliteDatabase } = await import('@loqua/adapters-web/sqlite');
        const runtime = (await import(/* turbopackIgnore: true */ SQLITE_RUNTIME_URL)) as {
          default: Sqlite3InitModule;
        };
        const db = await openSqliteDatabase(runtime.default);
        if (cancelled) {
          db.close();
          return;
        }
        storageRef.current = createSqliteStoragePort(db.executor);
        setStoragePersistent(db.persistent);
        detachErrorCards = attachErrorCardCreation(app.bus, {
          storage: storageRef.current,
          clock: systemClock,
        }).detach;
        detachGamification = attachGamification(app.bus, {
          storage: storageRef.current,
          clock: systemClock,
        }).detach;
        const stored = await storageRef.current.query<SessionRecord>('sessions', {});
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
      detachErrorCards?.();
      detachGamification?.();
    };
  }, [app.bus]);

  const eraseAll = useCallback(async () => {
    await storageRef.current?.eraseAll();
    setSessions([]);
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
    downloadProgress,
    sttTier: app.transcription.capability().qualityTier,
    microphoneConsent,
    cloudCorrection,
    sessions,
    storagePersistent,
    grantMicrophone,
    setCloudCorrection,
    eraseAll,
  };
}
