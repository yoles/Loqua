import { nextFailureAction } from './failure-policy.ts';
import { INITIAL_PIPELINE_STATE, transition } from './pipeline.ts';
import type { FailureAction } from './failure-policy.ts';
import type { PipelineEvent, PipelineState } from './pipeline.ts';
import type { EventBus } from '../events/event-bus.ts';
import type { AudioClip } from '../ports/audio-clip.ts';
import type { CorrectionPort, CorrectionResult } from '../ports/correction-port.ts';
import type { TranscriptionPort } from '../ports/transcription-port.ts';
import type { Variant } from '../shared/variant.ts';

// Le runner exécute les EFFETS autour du reducer pur : appels de ports,
// remontée d'état à l'UI, notification de fin pour la persistance.
// La politique d'échec (failure-policy) est explicite : retry automatique borné,
// puis l'action suivante est EXPOSÉE à l'UI — jamais de bascule silencieuse (#5).

export interface ReadySession {
  readonly clipId: string;
  readonly transcription: { readonly text: string };
  readonly correction: { readonly correctedText: string };
  readonly state: Extract<PipelineState, { phase: 'READY' }>;
}

// Sondes fournies par le composition root : elles décrivent quels adapters
// existent sur cette plateforme ; la décision reste dans la failure-policy.
export interface FailureRecoveryProbe {
  canDegradeToLocal(): boolean;
  canOfferCloudOptIn(): boolean;
}

export interface PipelineRunnerDeps {
  readonly transcription: TranscriptionPort;
  readonly correction: CorrectionPort;
  readonly variant: Variant;
  readonly onState: (state: PipelineState) => void;
  readonly onReady?: (session: ReadySession) => void;
  readonly events?: EventBus;
  readonly recovery?: FailureRecoveryProbe;
  // Relecture du transcript avant correction (toggle UI). Lue à chaque
  // transcription : quand elle renvoie `true`, le runner s'arrête à TRANSCRIBED
  // et attend `confirmTranscript` ; sinon il enchaîne la correction (défaut MVP).
  readonly shouldReviewTranscript?: () => boolean;
}

export interface PipelineRunner {
  state(): PipelineState;
  failureAction(): FailureAction | null;
  startRecording(): void;
  finishRecording(clip: AudioClip): Promise<void>;
  confirmTranscript(editedText?: string): Promise<void>;
  retry(): Promise<void>;
  abort(): void;
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function publishDetectedErrors(events: EventBus | undefined, correction: CorrectionResult): void {
  if (events === undefined) {
    return;
  }
  for (const detected of correction.corrections) {
    events.publish({
      kind: 'ErrorDetected',
      type: detected.type,
      value: { original: detected.original, fixed: detected.fixed },
    });
  }
}

export function createPipelineRunner(deps: PipelineRunnerDeps): PipelineRunner {
  let state: PipelineState = INITIAL_PIPELINE_STATE;
  let lastClip: AudioClip | null = null;

  function dispatch(event: PipelineEvent): void {
    state = transition(state, event);
    deps.onState(state);
  }

  function currentFailureAction(): FailureAction | null {
    const current = state;
    if (current.phase !== 'FAILED_STT' && current.phase !== 'FAILED_LLM') {
      return null;
    }
    return nextFailureAction(current, {
      canDegradeToLocal: deps.recovery?.canDegradeToLocal() ?? false,
      canOfferCloudOptIn: deps.recovery?.canOfferCloudOptIn() ?? false,
    });
  }

  async function transcribe(clip: AudioClip): Promise<void> {
    try {
      const transcription = await deps.transcription.transcribe(clip);
      dispatch({ type: 'TranscribeOk', transcription });
    } catch (error: unknown) {
      dispatch({ type: 'TranscribeErr', reason: reasonOf(error) });
      if (currentFailureAction() === 'retry') {
        dispatch({ type: 'RetryTranscription' });
        await transcribe(clip);
      }
      return;
    }
    if (deps.shouldReviewTranscript?.() ?? false) {
      return; // pause à TRANSCRIBED : l'UI attend confirmTranscript (relecture opt-in)
    }
    await correct();
  }

  function notifyReady(): void {
    const current = state;
    if (current.phase !== 'READY') {
      return;
    }
    publishDetectedErrors(deps.events, current.correction);
    // Approximation MVP : parole détectée = durée du clip (pas de VAD) —
    // le clip est démarré/arrêté manuellement, écart noté dans SPRINTS.
    deps.events?.publish({
      kind: 'SessionCompleted',
      sessionId: current.clipId,
      spokenMs: lastClip?.durationMs ?? 0,
    });
    deps.onReady?.({
      clipId: current.clipId,
      transcription: current.transcription,
      correction: current.correction,
      state: current,
    });
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
      notifyReady();
    } catch (error: unknown) {
      dispatch({ type: 'CorrectErr', reason: reasonOf(error) });
      if (currentFailureAction() === 'retry') {
        dispatch({ type: 'RetryCorrection' });
        await correct();
      }
    }
  }

  return {
    state: () => state,

    failureAction: currentFailureAction,

    startRecording(): void {
      dispatch({ type: 'RecordStarted' });
    },

    async finishRecording(clip: AudioClip): Promise<void> {
      lastClip = clip;
      dispatch({ type: 'RecordStopped', clipId: clip.id });
      await transcribe(clip);
    },

    async confirmTranscript(editedText?: string): Promise<void> {
      if (state.phase !== 'TRANSCRIBED') {
        return;
      }
      const edited = editedText?.trim();
      if (edited !== undefined && edited.length > 0 && edited !== state.transcription.text) {
        dispatch({ type: 'TranscriptEdited', text: edited });
      }
      await correct();
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
