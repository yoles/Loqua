import type { PipelineState } from '@loqua/core';

// Mapper PUR état-pipeline → props d'affichage : l'UI reflète la machine,
// elle ne décide rien (testé en Node, sans DOM).
export type FailureCause = 'egress-refused' | 'undecodable-audio' | 'other';

export interface SessionFailureView {
  readonly kind: 'stt' | 'llm';
  readonly reason: string;
  readonly cause: FailureCause;
  readonly canRetry: boolean;
}

export interface SessionView {
  readonly canStartRecording: boolean;
  readonly isRecording: boolean;
  readonly busyLabel: string | null;
  readonly failure: SessionFailureView | null;
  // Relecture opt-in : le transcript brut à relire/éditer avant correction.
  readonly review: { readonly transcript: string } | null;
  readonly diff: {
    readonly originalText: string;
    readonly correctedText: string;
  } | null;
}

export interface SessionViewOptions {
  readonly reviewMode?: boolean;
}

function failureCauseOf(reason: string): FailureCause {
  if (reason.includes('egress refused')) {
    return 'egress-refused';
  }
  if (reason.includes('audio-decode-failed')) {
    return 'undecodable-audio';
  }
  return 'other';
}

function failureView(kind: 'stt' | 'llm', reason: string): SessionFailureView {
  const cause = failureCauseOf(reason);
  // Un clip indécodable re-échouera à l'identique : seul un nouvel enregistrement aide.
  return { kind, reason, cause, canRetry: cause !== 'undecodable-audio' };
}

function busyLabelOf(state: PipelineState, reviewMode: boolean): string | null {
  if (state.phase === 'TRANSCRIBING') {
    return `Transcription locale… (essai ${state.attempt})`;
  }
  if (state.phase === 'CORRECTING') {
    return 'Correction en cours…';
  }
  // En relecture opt-in, TRANSCRIBED est une pause éditable, pas un moment « busy ».
  if (state.phase === 'TRANSCRIBED' && !reviewMode) {
    return 'Correction en cours…';
  }
  return null;
}

export function sessionView(state: PipelineState, options: SessionViewOptions = {}): SessionView {
  const reviewMode = options.reviewMode ?? false;
  return {
    canStartRecording: state.phase === 'IDLE' || state.phase === 'READY',
    isRecording: state.phase === 'RECORDING',
    busyLabel: busyLabelOf(state, reviewMode),
    review:
      reviewMode && state.phase === 'TRANSCRIBED' ? { transcript: state.transcription.text } : null,
    failure:
      state.phase === 'FAILED_STT'
        ? failureView('stt', state.reason)
        : state.phase === 'FAILED_LLM'
          ? failureView('llm', state.reason)
          : null,
    diff:
      state.phase === 'READY'
        ? {
            originalText: state.transcription.text,
            correctedText: state.correction.correctedText,
          }
        : null,
  };
}
