import type { PipelineState } from '@loqua/core';

// Mapper PUR état-pipeline → props d'affichage : l'UI reflète la machine,
// elle ne décide rien (testé en Node, sans DOM).
export interface SessionView {
  readonly canStartRecording: boolean;
  readonly isRecording: boolean;
  readonly busyLabel: string | null;
  readonly failure: { readonly kind: 'stt' | 'llm'; readonly reason: string } | null;
  readonly diff: {
    readonly originalText: string;
    readonly correctedText: string;
  } | null;
}

export function sessionView(state: PipelineState): SessionView {
  return {
    canStartRecording: state.phase === 'IDLE' || state.phase === 'READY',
    isRecording: state.phase === 'RECORDING',
    busyLabel:
      state.phase === 'TRANSCRIBING'
        ? `Transcription locale… (essai ${state.attempt})`
        : state.phase === 'TRANSCRIBED' || state.phase === 'CORRECTING'
          ? 'Correction en cours…'
          : null,
    failure:
      state.phase === 'FAILED_STT'
        ? { kind: 'stt', reason: state.reason }
        : state.phase === 'FAILED_LLM'
          ? { kind: 'llm', reason: state.reason }
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
