import { PipelineError } from './errors.ts';
import { deepFreeze } from '../shared/freeze.ts';
import type { CorrectionResult } from '../ports/correction-port.ts';
import type { TranscriptionResult } from '../ports/transcription-port.ts';

// Machine à états du MVP (ARCHITECTURE §10) — reducer PUR, aucun I/O.
// Les effets (appels de ports, politique de retry, persistance des transitions)
// vivent dans le runner (lot 2.7). `attempt` informe la politique, il ne la décide pas.
export type PipelineState =
  | { readonly phase: 'IDLE' }
  | { readonly phase: 'RECORDING' }
  | { readonly phase: 'TRANSCRIBING'; readonly clipId: string; readonly attempt: number }
  | {
      readonly phase: 'TRANSCRIBED';
      readonly clipId: string;
      readonly transcription: TranscriptionResult;
    }
  | {
      readonly phase: 'CORRECTING';
      readonly clipId: string;
      readonly transcription: TranscriptionResult;
      readonly attempt: number;
    }
  | {
      readonly phase: 'CORRECTED';
      readonly clipId: string;
      readonly transcription: TranscriptionResult;
      readonly correction: CorrectionResult;
    }
  | {
      readonly phase: 'READY';
      readonly clipId: string;
      readonly transcription: TranscriptionResult;
      readonly correction: CorrectionResult;
    }
  | {
      readonly phase: 'FAILED_STT';
      readonly clipId: string;
      readonly reason: string;
      readonly attempts: number;
    }
  | {
      readonly phase: 'FAILED_LLM';
      readonly clipId: string;
      readonly transcription: TranscriptionResult;
      readonly reason: string;
      readonly attempts: number;
    };

export type PipelineEvent =
  | { readonly type: 'RecordStarted' }
  | { readonly type: 'RecordStopped'; readonly clipId: string }
  | { readonly type: 'TranscribeOk'; readonly transcription: TranscriptionResult }
  | { readonly type: 'TranscribeErr'; readonly reason: string }
  | { readonly type: 'RetryTranscription' }
  | { readonly type: 'CorrectStarted' }
  | { readonly type: 'CorrectOk'; readonly correction: CorrectionResult }
  | { readonly type: 'CorrectErr'; readonly reason: string }
  | { readonly type: 'RetryCorrection' }
  | { readonly type: 'DiffDisplayed' }
  | { readonly type: 'Aborted' };

export const INITIAL_PIPELINE_STATE: PipelineState = deepFreeze({ phase: 'IDLE' });

function reject(state: PipelineState, event: PipelineEvent): never {
  throw new PipelineError(`event ${event.type} is not allowed in phase ${state.phase}`);
}

export function transition(state: PipelineState, event: PipelineEvent): PipelineState {
  return deepFreeze(next(state, event));
}

function next(state: PipelineState, event: PipelineEvent): PipelineState {
  if (event.type === 'Aborted') {
    if (state.phase === 'IDLE') {
      reject(state, event);
    }
    return { phase: 'IDLE' };
  }

  switch (state.phase) {
    case 'IDLE':
      if (event.type === 'RecordStarted') {
        return { phase: 'RECORDING' };
      }
      return reject(state, event);

    case 'RECORDING':
      if (event.type === 'RecordStopped') {
        return { phase: 'TRANSCRIBING', clipId: event.clipId, attempt: 1 };
      }
      return reject(state, event);

    case 'TRANSCRIBING':
      if (event.type === 'TranscribeOk') {
        return { phase: 'TRANSCRIBED', clipId: state.clipId, transcription: event.transcription };
      }
      if (event.type === 'TranscribeErr') {
        return {
          phase: 'FAILED_STT',
          clipId: state.clipId,
          reason: event.reason,
          attempts: state.attempt,
        };
      }
      return reject(state, event);

    case 'TRANSCRIBED':
      if (event.type === 'CorrectStarted') {
        return {
          phase: 'CORRECTING',
          clipId: state.clipId,
          transcription: state.transcription,
          attempt: 1,
        };
      }
      return reject(state, event);

    case 'CORRECTING':
      if (event.type === 'CorrectOk') {
        return {
          phase: 'CORRECTED',
          clipId: state.clipId,
          transcription: state.transcription,
          correction: event.correction,
        };
      }
      if (event.type === 'CorrectErr') {
        return {
          phase: 'FAILED_LLM',
          clipId: state.clipId,
          transcription: state.transcription,
          reason: event.reason,
          attempts: state.attempt,
        };
      }
      return reject(state, event);

    case 'CORRECTED':
      if (event.type === 'DiffDisplayed') {
        return {
          phase: 'READY',
          clipId: state.clipId,
          transcription: state.transcription,
          correction: state.correction,
        };
      }
      return reject(state, event);

    case 'READY':
      return reject(state, event);

    case 'FAILED_STT':
      if (event.type === 'RetryTranscription') {
        return { phase: 'TRANSCRIBING', clipId: state.clipId, attempt: state.attempts + 1 };
      }
      return reject(state, event);

    case 'FAILED_LLM':
      if (event.type === 'RetryCorrection') {
        return {
          phase: 'CORRECTING',
          clipId: state.clipId,
          transcription: state.transcription,
          attempt: state.attempts + 1,
        };
      }
      return reject(state, event);
  }
}
