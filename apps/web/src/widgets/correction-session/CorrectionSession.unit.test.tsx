// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CorrectionSession } from './CorrectionSession';
import { CorrectionAppContext } from '@/composition-root/correction-app-context';
import type { CorrectionApp } from '@/composition-root';
import type {
  CorrectionResult,
  PipelineRunner,
  PipelineState,
  PronunciationScoringPort,
  TranscriptionResult,
} from '@loqua/core';

const transcription: TranscriptionResult = {
  text: 'yesterday I have make a deploy',
  words: [],
  language: 'en',
};

const correction: CorrectionResult = {
  variant: 'en-US',
  correctedText: 'Yesterday I deployed',
  corrections: [],
  qualityTier: 'local-basic',
};

const readyState: PipelineState = {
  phase: 'READY',
  clipId: 'clip-1',
  transcription,
  correction,
};

const failedSttState: PipelineState = {
  phase: 'FAILED_STT',
  clipId: 'clip-1',
  reason: 'model crashed',
  attempts: 1,
};

const failedLlmState: PipelineState = {
  phase: 'FAILED_LLM',
  clipId: 'clip-1',
  transcription,
  reason: 'egress refused: no-consent',
  attempts: 1,
};

const scoring: PronunciationScoringPort = {
  capability: () => ({ available: true, qualityTier: 'local-basic' }),
  score: vi.fn(),
};

function fakeRunner(overrides?: Partial<PipelineRunner>): PipelineRunner {
  return {
    state: () => ({ phase: 'IDLE' }),
    failureAction: () => null,
    startRecording: vi.fn(),
    finishRecording: vi.fn().mockResolvedValue(undefined),
    confirmTranscript: vi.fn().mockResolvedValue(undefined),
    retry: vi.fn().mockResolvedValue(undefined),
    abort: vi.fn(),
    ...overrides,
  };
}

function fakeApp(overrides?: Partial<CorrectionApp>): CorrectionApp {
  return {
    state: { phase: 'IDLE' },
    runner: fakeRunner(),
    speechSynthesis: null,
    phonemizer: null,
    scoring,
    downloadProgress: null,
    sttTier: 'local-basic',
    isDesktop: false,
    microphoneConsent: true,
    cloudCorrection: false,
    reviewBeforeCorrection: false,
    sessions: [],
    storagePersistent: true,
    review: null,
    cardsVersion: 0,
    gamification: null,
    grantMicrophone: vi.fn(),
    setCloudCorrection: vi.fn(),
    setReviewBeforeCorrection: vi.fn(),
    practiceWord: vi.fn(),
    eraseAll: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function renderSession(overrides?: Partial<CorrectionApp>): CorrectionApp {
  const app = fakeApp(overrides);
  render(
    <CorrectionAppContext.Provider value={app}>
      <CorrectionSession />
    </CorrectionAppContext.Provider>,
  );
  return app;
}

afterEach(cleanup);

describe('CorrectionSession (smart widget reflecting the pipeline state)', () => {
  it('keeps the microphone unreachable behind the consent gate while consent is refused', () => {
    renderSession({ microphoneConsent: false });

    expect(screen.queryByRole('button', { name: /Parler en anglais/ })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Ton micro, tes données' })).toBeDefined();
  });

  it('shows the real STT and correction quality tiers when the diff is ready (no silent degradation)', () => {
    renderSession({ state: readyState, sttTier: 'local-basic' });

    expect(screen.getByText('STT : local-basic (local)')).toBeDefined();
    expect(screen.getByText('correction : local-basic')).toBeDefined();
  });

  it('offers retry and abandon when the transcription fails', () => {
    const app = renderSession({ state: failedSttState });

    expect(screen.getByRole('alert')).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Transcription impossible' })).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(app.runner.retry).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Abandonner' }));
    expect(app.runner.abort).toHaveBeenCalledTimes(1);
  });

  it('proposes the explicit cloud opt-in when the egress guard refused the text (web)', () => {
    renderSession({ state: failedLlmState, isDesktop: false });

    expect(screen.getByRole('heading', { name: 'Correction impossible' })).toBeDefined();
    expect(screen.getByText(/La correction avancée est désactivée/)).toBeDefined();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeDefined();
  });

  it('surfaces the cloud opt-in offer when the core failure policy decides it', () => {
    renderSession({
      state: { ...failedLlmState, reason: 'provider 502', attempts: 3 },
      runner: fakeRunner({ failureAction: () => 'offer-cloud-optin' }),
      isDesktop: false,
    });

    expect(screen.getByText(/La correction avancée est désactivée/)).toBeDefined();
  });

  it('lets the user edit the transcript and confirm before correction when review is enabled', () => {
    const transcribedState: PipelineState = {
      phase: 'TRANSCRIBED',
      clipId: 'clip-1',
      transcription,
    };
    const app = renderSession({ state: transcribedState, reviewBeforeCorrection: true });

    const textarea = screen.getByLabelText('Transcription à relire');
    fireEvent.change(textarea, { target: { value: 'I read a lot' } });
    fireEvent.click(screen.getByRole('button', { name: 'Corriger' }));

    expect(app.runner.confirmTranscript).toHaveBeenCalledWith('I read a lot');
  });

  it('does not show the review panel on the fast path (review disabled)', () => {
    const transcribedState: PipelineState = {
      phase: 'TRANSCRIBED',
      clipId: 'clip-1',
      transcription,
    };
    renderSession({ state: transcribedState, reviewBeforeCorrection: false });

    expect(screen.queryByRole('heading', { name: 'Relis ta transcription' })).toBeNull();
  });

  it('offers only re-recording when the clip is undecodable (a retry would fail identically)', () => {
    renderSession({
      state: { ...failedSttState, reason: 'audio-decode-failed: empty clip' },
    });

    expect(screen.queryByRole('button', { name: 'Réessayer' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Ré-enregistrer' })).toBeDefined();
  });
});
