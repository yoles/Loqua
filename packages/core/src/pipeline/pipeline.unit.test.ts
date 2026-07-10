import { describe, expect, it } from 'vitest';

import { PipelineError } from './errors.ts';
import { INITIAL_PIPELINE_STATE, transition } from './pipeline.ts';
import type { PipelineEvent, PipelineState } from './pipeline.ts';
import type { CorrectionResult, TranscriptionResult } from '../index.ts';

const transcription: TranscriptionResult = {
  text: 'yesterday I have make a deploy',
  words: [{ text: 'yesterday', startMs: 0, endMs: 480 }],
  language: 'en',
};

const correction: CorrectionResult = {
  variant: 'en-US',
  correctedText: 'Yesterday I deployed',
  corrections: [],
  qualityTier: 'cloud-native',
};

function drive(events: readonly PipelineEvent[]): PipelineState {
  return events.reduce(transition, INITIAL_PIPELINE_STATE);
}

const happyPathToReady: readonly PipelineEvent[] = [
  { type: 'RecordStarted' },
  { type: 'RecordStopped', clipId: 'clip-1' },
  { type: 'TranscribeOk', transcription },
  { type: 'CorrectStarted' },
  { type: 'CorrectOk', correction },
  { type: 'DiffDisplayed' },
];

describe('pipeline reducer — happy path', () => {
  it('starts idle', () => {
    expect(INITIAL_PIPELINE_STATE.phase).toBe('IDLE');
  });

  it('walks IDLE → RECORDING → TRANSCRIBING → TRANSCRIBED → CORRECTING → CORRECTED → READY', () => {
    let state: PipelineState = INITIAL_PIPELINE_STATE;

    state = transition(state, { type: 'RecordStarted' });
    expect(state.phase).toBe('RECORDING');

    state = transition(state, { type: 'RecordStopped', clipId: 'clip-1' });
    expect(state).toMatchObject({ phase: 'TRANSCRIBING', clipId: 'clip-1', attempt: 1 });

    state = transition(state, { type: 'TranscribeOk', transcription });
    expect(state).toMatchObject({ phase: 'TRANSCRIBED', clipId: 'clip-1' });

    state = transition(state, { type: 'CorrectStarted' });
    expect(state).toMatchObject({ phase: 'CORRECTING', attempt: 1 });

    state = transition(state, { type: 'CorrectOk', correction });
    expect(state).toMatchObject({ phase: 'CORRECTED', clipId: 'clip-1' });

    state = transition(state, { type: 'DiffDisplayed' });
    expect(state).toMatchObject({ phase: 'READY' });
    if (state.phase === 'READY') {
      expect(state.transcription.text).toBe(transcription.text);
      expect(state.correction.correctedText).toBe('Yesterday I deployed');
    }
  });

  it('starts a fresh recording from READY (record another sentence)', () => {
    const ready = drive(happyPathToReady);
    expect(ready.phase).toBe('READY');

    const recording = transition(ready, { type: 'RecordStarted' });

    expect(recording).toEqual({ phase: 'RECORDING' });
  });

  it('returns frozen states (no mutation from consumers)', () => {
    const state = drive(happyPathToReady);

    expect(Object.isFrozen(state)).toBe(true);
  });
});

describe('pipeline reducer — failures and recovery', () => {
  const toTranscribing: readonly PipelineEvent[] = [
    { type: 'RecordStarted' },
    { type: 'RecordStopped', clipId: 'clip-1' },
  ];

  it('records an STT failure with its attempt count', () => {
    const state = drive([...toTranscribing, { type: 'TranscribeErr', reason: 'model OOM' }]);

    expect(state).toMatchObject({
      phase: 'FAILED_STT',
      clipId: 'clip-1',
      reason: 'model OOM',
      attempts: 1,
    });
  });

  it('retries transcription with an incremented attempt', () => {
    const state = drive([
      ...toTranscribing,
      { type: 'TranscribeErr', reason: 'model OOM' },
      { type: 'RetryTranscription' },
    ]);

    expect(state).toMatchObject({ phase: 'TRANSCRIBING', clipId: 'clip-1', attempt: 2 });
  });

  it('records an LLM failure keeping the transcript', () => {
    const state = drive([
      ...toTranscribing,
      { type: 'TranscribeOk', transcription },
      { type: 'CorrectStarted' },
      { type: 'CorrectErr', reason: 'invalid JSON' },
    ]);

    expect(state).toMatchObject({ phase: 'FAILED_LLM', reason: 'invalid JSON', attempts: 1 });
    if (state.phase === 'FAILED_LLM') {
      expect(state.transcription.text).toBe(transcription.text);
    }
  });

  it('retries correction with an incremented attempt', () => {
    const state = drive([
      ...toTranscribing,
      { type: 'TranscribeOk', transcription },
      { type: 'CorrectStarted' },
      { type: 'CorrectErr', reason: 'invalid JSON' },
      { type: 'RetryCorrection' },
    ]);

    expect(state).toMatchObject({ phase: 'CORRECTING', attempt: 2 });
  });

  it('aborts back to IDLE from any active phase', () => {
    for (const prefix of [
      [{ type: 'RecordStarted' }] as const,
      toTranscribing,
      [...toTranscribing, { type: 'TranscribeErr', reason: 'x' }] as const,
      [
        ...toTranscribing,
        { type: 'TranscribeOk', transcription },
        { type: 'CorrectStarted' },
        { type: 'CorrectErr', reason: 'x' },
      ] as const,
    ]) {
      const state = drive([...prefix, { type: 'Aborted' }]);
      expect(state.phase).toBe('IDLE');
    }
  });
});

describe('pipeline reducer — invalid transitions are rejected explicitly', () => {
  const statesByPhase: Record<string, readonly PipelineEvent[]> = {
    IDLE: [],
    RECORDING: [{ type: 'RecordStarted' }],
    TRANSCRIBING: [{ type: 'RecordStarted' }, { type: 'RecordStopped', clipId: 'c' }],
    TRANSCRIBED: [
      { type: 'RecordStarted' },
      { type: 'RecordStopped', clipId: 'c' },
      { type: 'TranscribeOk', transcription },
    ],
    CORRECTING: [
      { type: 'RecordStarted' },
      { type: 'RecordStopped', clipId: 'c' },
      { type: 'TranscribeOk', transcription },
      { type: 'CorrectStarted' },
    ],
    CORRECTED: [
      { type: 'RecordStarted' },
      { type: 'RecordStopped', clipId: 'c' },
      { type: 'TranscribeOk', transcription },
      { type: 'CorrectStarted' },
      { type: 'CorrectOk', correction },
    ],
    READY: [
      { type: 'RecordStarted' },
      { type: 'RecordStopped', clipId: 'c' },
      { type: 'TranscribeOk', transcription },
      { type: 'CorrectStarted' },
      { type: 'CorrectOk', correction },
      { type: 'DiffDisplayed' },
    ],
  };

  const invalidEventByPhase: Record<string, PipelineEvent> = {
    IDLE: { type: 'TranscribeOk', transcription },
    RECORDING: { type: 'CorrectOk', correction },
    TRANSCRIBING: { type: 'RecordStarted' },
    TRANSCRIBED: { type: 'TranscribeOk', transcription },
    CORRECTING: { type: 'RecordStopped', clipId: 'c' },
    CORRECTED: { type: 'CorrectErr', reason: 'x' },
    READY: { type: 'DiffDisplayed' },
  };

  for (const [phase, prefix] of Object.entries(statesByPhase)) {
    it(`rejects an out-of-place event in ${phase}`, () => {
      const state = drive(prefix);
      const invalid = invalidEventByPhase[phase];

      expect(invalid).toBeDefined();
      expect(() => transition(state, invalid as PipelineEvent)).toThrow(PipelineError);
    });
  }

  it('rejects retry events outside failure phases', () => {
    expect(() => transition(INITIAL_PIPELINE_STATE, { type: 'RetryTranscription' })).toThrow(
      PipelineError,
    );
    expect(() => transition(INITIAL_PIPELINE_STATE, { type: 'RetryCorrection' })).toThrow(
      PipelineError,
    );
  });

  it('rejects abort when already idle', () => {
    expect(() => transition(INITIAL_PIPELINE_STATE, { type: 'Aborted' })).toThrow(PipelineError);
  });
});
