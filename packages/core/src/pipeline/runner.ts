import { INITIAL_PIPELINE_STATE, transition } from './pipeline.ts';
import type { PipelineEvent, PipelineState } from './pipeline.ts';
import type { AudioClip } from '../ports/audio-clip.ts';
import type { CorrectionPort } from '../ports/correction-port.ts';
import type { TranscriptionPort } from '../ports/transcription-port.ts';
import type { Variant } from '../shared/variant.ts';

// Le runner exécute les EFFETS autour du reducer pur : appels de ports,
// remontée d'état à l'UI, notification de fin pour la persistance.
// La politique d'échec est explicite : l'échec est montré, l'utilisateur choisit
// (retry / abandon) — jamais de bascule silencieuse (invariant #5).

export interface ReadySession {
  readonly clipId: string;
  readonly transcription: { readonly text: string };
  readonly correction: { readonly correctedText: string };
  readonly state: Extract<PipelineState, { phase: 'READY' }>;
}

export interface PipelineRunnerDeps {
  readonly transcription: TranscriptionPort;
  readonly correction: CorrectionPort;
  readonly variant: Variant;
  readonly onState: (state: PipelineState) => void;
  readonly onReady?: (session: ReadySession) => void;
}

export interface PipelineRunner {
  state(): PipelineState;
  startRecording(): void;
  finishRecording(clip: AudioClip): Promise<void>;
  retry(): Promise<void>;
  abort(): void;
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createPipelineRunner(deps: PipelineRunnerDeps): PipelineRunner {
  let state: PipelineState = INITIAL_PIPELINE_STATE;
  let lastClip: AudioClip | null = null;

  function dispatch(event: PipelineEvent): void {
    state = transition(state, event);
    deps.onState(state);
  }

  async function transcribe(clip: AudioClip): Promise<void> {
    try {
      const transcription = await deps.transcription.transcribe(clip);
      dispatch({ type: 'TranscribeOk', transcription });
    } catch (error: unknown) {
      dispatch({ type: 'TranscribeErr', reason: reasonOf(error) });
      return;
    }
    await correct();
  }

  async function correct(): Promise<void> {
    if (state.phase !== 'TRANSCRIBED' && state.phase !== 'CORRECTING') {
      return;
    }
    if (state.phase === 'TRANSCRIBED') {
      dispatch({ type: 'CorrectStarted' });
    }
    if (state.phase !== 'CORRECTING') {
      return;
    }
    const text = state.transcription.text;
    try {
      const correction = await deps.correction.correct({ text, variant: deps.variant });
      dispatch({ type: 'CorrectOk', correction });
      dispatch({ type: 'DiffDisplayed' }); // READY = le diff est affichable
      const current = ((): PipelineState => state)(); // dispatch a muté l'état fermé
      if (current.phase === 'READY') {
        deps.onReady?.({
          clipId: current.clipId,
          transcription: current.transcription,
          correction: current.correction,
          state: current,
        });
      }
    } catch (error: unknown) {
      dispatch({ type: 'CorrectErr', reason: reasonOf(error) });
    }
  }

  return {
    state: () => state,

    startRecording(): void {
      dispatch({ type: 'RecordStarted' });
    },

    async finishRecording(clip: AudioClip): Promise<void> {
      lastClip = clip;
      dispatch({ type: 'RecordStopped', clipId: clip.id });
      await transcribe(clip);
    },

    async retry(): Promise<void> {
      if (state.phase === 'FAILED_STT') {
        if (lastClip === null) {
          return;
        }
        dispatch({ type: 'RetryTranscription' });
        await transcribe(lastClip);
        return;
      }
      if (state.phase === 'FAILED_LLM') {
        dispatch({ type: 'RetryCorrection' });
        await correct();
      }
    },

    abort(): void {
      dispatch({ type: 'Aborted' });
      lastClip = null;
    },
  };
}
