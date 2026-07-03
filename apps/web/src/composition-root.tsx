'use client';

// COMPOSITION ROOT de l'app web (ARCHITECTURE §5, §20) : le SEUL endroit qui
// instancie les adapters et les injecte dans le core. Aucune feature n'importe
// un adapter directement.
import { useCallback, useMemo, useRef, useState } from 'react';

import {
  createEgressGuard,
  createEventBus,
  createPipelineRunner,
  makeConsent,
  INITIAL_PIPELINE_STATE,
  type PipelineRunner,
  type PipelineState,
} from '@loqua/core';
import {
  createCloudCorrectionPort,
  createTransformersAsrEngineFactory,
  createWhisperTranscriptionPort,
} from '@loqua/adapters-web';

const CORRECTION_ENDPOINT =
  process.env['NEXT_PUBLIC_CORRECTION_API'] ?? 'http://localhost:8787/v1/correction';

export interface CorrectionApp {
  readonly state: PipelineState;
  readonly runner: PipelineRunner;
  readonly downloadProgress: number | null; // 0..1 pendant le download du modèle STT
  readonly sttTier: string;
  readonly microphoneConsent: boolean;
  readonly cloudCorrection: boolean;
  grantMicrophone(): void;
  setCloudCorrection(enabled: boolean): void;
}

export function useCorrectionApp(): CorrectionApp {
  const [state, setState] = useState<PipelineState>(INITIAL_PIPELINE_STATE);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [microphoneConsent, setMicrophoneConsent] = useState(false);
  const [cloudCorrection, setCloudCorrectionState] = useState(false);
  const cloudOptInRef = useRef(false);

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
    });

    return { bus, runner, transcription };
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
    grantMicrophone,
    setCloudCorrection,
  };
}
