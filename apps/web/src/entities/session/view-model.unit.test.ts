import { describe, expect, it } from 'vitest';

import { sessionView } from './view-model.ts';
import { INITIAL_PIPELINE_STATE, transition, type PipelineState } from '@loqua/core';

const transcription = { text: 'I have make a deploy', words: [], language: 'en' };
const correction = {
  variant: 'en-US' as const,
  correctedText: 'I deployed',
  corrections: [],
  qualityTier: 'cloud-native' as const,
};

function stateAt(phase: string): PipelineState {
  let state = INITIAL_PIPELINE_STATE;
  const path = [
    { type: 'RecordStarted' },
    { type: 'RecordStopped', clipId: 'c' },
    { type: 'TranscribeOk', transcription },
    { type: 'CorrectStarted' },
    { type: 'CorrectOk', correction },
    { type: 'DiffDisplayed' },
  ] as const;
  for (const event of path) {
    if (state.phase === phase) {
      return state;
    }
    state = transition(state, event);
  }
  return state;
}

describe('session view model reflects the pipeline state', () => {
  it('lets the user record when idle, not while busy', () => {
    expect(sessionView(stateAt('IDLE')).canStartRecording).toBe(true);
    expect(sessionView(stateAt('TRANSCRIBING')).canStartRecording).toBe(false);
    expect(sessionView(stateAt('READY')).canStartRecording).toBe(true);
  });

  it('labels the busy phases', () => {
    expect(sessionView(stateAt('TRANSCRIBING')).busyLabel).toContain('Transcription');
    expect(sessionView(stateAt('CORRECTING')).busyLabel).toContain('Correction');
    expect(sessionView(stateAt('IDLE')).busyLabel).toBeNull();
  });

  it('exposes the diff only when READY', () => {
    expect(sessionView(stateAt('CORRECTING')).diff).toBeNull();
    expect(sessionView(stateAt('READY')).diff).toEqual({
      originalText: 'I have make a deploy',
      correctedText: 'I deployed',
    });
  });

  it('surfaces an STT failure with its reason (never silent)', () => {
    const failed = failedSttWith('model OOM');

    expect(sessionView(failed).failure).toMatchObject({ kind: 'stt', reason: 'model OOM' });
  });

  it('allows retry on a transient STT failure', () => {
    const view = sessionView(failedSttWith('model OOM'));

    expect(view.failure?.cause).toBe('other');
    expect(view.failure?.canRetry).toBe(true);
  });

  it('forbids retry on an undecodable capture (same clip would fail again)', () => {
    const view = sessionView(
      failedSttWith('local transcription failed (clip x): audio-decode-failed: empty capture'),
    );

    expect(view.failure?.cause).toBe('undecodable-audio');
    expect(view.failure?.canRetry).toBe(false);
  });

  it('identifies an egress refusal so the UI can propose the cloud opt-in', () => {
    const failedLlm = transition(
      transition(stateAt('TRANSCRIBED'), { type: 'CorrectStarted' }),
      { type: 'CorrectErr', reason: 'egress refused: no-consent' },
    );

    const view = sessionView(failedLlm);

    expect(view.failure?.kind).toBe('llm');
    expect(view.failure?.cause).toBe('egress-refused');
    expect(view.failure?.canRetry).toBe(true);
  });
});

function failedSttWith(reason: string): PipelineState {
  return transition(
    transition(transition(INITIAL_PIPELINE_STATE, { type: 'RecordStarted' }), {
      type: 'RecordStopped',
      clipId: 'c',
    }),
    { type: 'TranscribeErr', reason },
  );
}
