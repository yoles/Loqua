'use client';

// COMPOSITION ROOT de l'app web (ARCHITECTURE §5, §20) : le SEUL endroit qui
// instancie les adapters et les injecte dans le core. Chaque hook porte UNE
// responsabilité ; ce fichier ne fait que les composer et exposer le Provider.
import { useCallback, useRef, type ReactNode } from 'react';

import { isTauriRuntime } from '@loqua/adapters-tauri';

import { CorrectionAppContext } from './correction-app-context';
import { useConsentControls } from './use-consent-controls';
import { useCorrectionPipeline } from './use-correction-pipeline';
import { useLearningBootstrap } from './use-learning-bootstrap';
import { useSessionPersistence } from './use-session-persistence';
import type { CorrectionApp } from './correction-app';
import type { CorrectionPipeline } from './use-correction-pipeline';

function pipelineView(pipeline: CorrectionPipeline) {
  return {
    state: pipeline.state,
    runner: pipeline.runner,
    speechSynthesis: pipeline.ports.speechSynthesis,
    phonemizer: pipeline.ports.phonemizer,
    scoring: pipeline.ports.scoring,
    downloadProgress: pipeline.downloadProgress,
    sttTier: pipeline.ports.transcription.capability().qualityTier,
  };
}

function useCorrectionAppInternal(): CorrectionApp {
  const cloudOptInRef = useRef(false);
  const persistence = useSessionPersistence();
  const pipeline = useCorrectionPipeline({
    cloudOptIn: () => cloudOptInRef.current,
    onReady: persistence.persistSession,
  });
  const consent = useConsentControls(pipeline.bus, cloudOptInRef);
  const learning = useLearningBootstrap({
    bus: pipeline.bus,
    storageRef: persistence.storageRef,
    setSessions: persistence.setSessions,
  });
  const practiceWord = useCallback(
    (word: string) => pipeline.bus.publish({ kind: 'PronunciationValidated', word }),
    [pipeline.bus],
  );

  return {
    ...pipelineView(pipeline),
    isDesktop: isTauriRuntime(),
    sessions: persistence.sessions,
    ...consent,
    ...learning,
    practiceWord,
  };
}

interface CorrectionAppProviderProps {
  readonly children: ReactNode;
}

export function CorrectionAppProvider({ children }: CorrectionAppProviderProps) {
  const app = useCorrectionAppInternal();
  return <CorrectionAppContext.Provider value={app}>{children}</CorrectionAppContext.Provider>;
}
CorrectionAppProvider.displayName = 'CorrectionAppProvider';
