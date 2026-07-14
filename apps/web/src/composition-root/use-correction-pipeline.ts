import { useMemo, useRef, useState } from 'react';

import {
  createEgressGuard,
  createEventBus,
  createPipelineRunner,
  INITIAL_PIPELINE_STATE,
} from '@loqua/core';

import { buildPipelinePorts, buildRecoveryProbe } from './adapters';
import type { PipelinePorts } from './adapters';
import type { EventBus, PipelineRunner, PipelineState, ReadySession } from '@loqua/core';
import type { MutableRefObject } from 'react';

interface CorrectionPipelineOptions {
  readonly cloudOptIn: () => boolean;
  readonly shouldReviewTranscript: () => boolean;
  readonly onReady: (session: ReadySession) => void;
}

export interface CorrectionPipeline {
  readonly state: PipelineState;
  readonly runner: PipelineRunner;
  readonly bus: EventBus;
  readonly ports: PipelinePorts;
  readonly downloadProgress: number | null;
}

function assemblePipeline(
  optionsRef: MutableRefObject<CorrectionPipelineOptions>,
  onState: (state: PipelineState) => void,
  onDownloadProgress: (ratio: number) => void,
): { bus: EventBus; ports: PipelinePorts; runner: PipelineRunner } {
  const bus = createEventBus();
  const guard = createEgressGuard(bus, null);
  const cloudOptIn = (): boolean => optionsRef.current.cloudOptIn();
  const ports = buildPipelinePorts({ guard, cloudOptIn, onDownloadProgress });
  const runner = createPipelineRunner({
    transcription: ports.transcription,
    correction: ports.correction,
    variant: 'en-US',
    onState,
    onReady: (session) => optionsRef.current.onReady(session),
    events: bus,
    recovery: buildRecoveryProbe(cloudOptIn),
    shouldReviewTranscript: () => optionsRef.current.shouldReviewTranscript(),
  });
  return { bus, ports, runner };
}

export function useCorrectionPipeline(options: CorrectionPipelineOptions): CorrectionPipeline {
  const [state, setState] = useState<PipelineState>(INITIAL_PIPELINE_STATE);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  // Assemblage UNIQUE au montage ; la ref garde les callbacks du parent à jour
  // sans jamais réassembler les adapters.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const app = useMemo(
    () =>
      assemblePipeline(optionsRef, setState, (ratio) =>
        setDownloadProgress(ratio >= 1 ? null : ratio),
      ),
    [],
  );

  return { state, runner: app.runner, bus: app.bus, ports: app.ports, downloadProgress };
}
