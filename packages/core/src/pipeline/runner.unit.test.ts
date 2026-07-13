import { describe, expect, it, vi } from 'vitest';

import { createEventBus, makeCorrection } from '../index.ts';
import { createPipelineRunner } from './runner.ts';
import type {
  AudioClip,
  CorrectionPort,
  CorrectionResult,
  DomainEvent,
  TranscriptionPort,
  TranscriptionResult,
} from '../index.ts';

const clip: AudioClip = {
  id: 'clip-1',
  format: 'pcm',
  sampleRate: 16_000,
  data: new ArrayBuffer(4),
  durationMs: 1000,
};

const transcription: TranscriptionResult = {
  text: 'yesterday I have make a deploy',
  words: [],
  language: 'en',
};

const correction: CorrectionResult = {
  variant: 'en-US',
  correctedText: 'Yesterday I deployed',
  corrections: [],
  qualityTier: 'cloud-native',
};

function fakeTranscription(overrides?: Partial<TranscriptionPort>): TranscriptionPort {
  return {
    capability: () => ({ available: true, qualityTier: 'local-basic' }),
    transcribe: vi.fn().mockResolvedValue(transcription),
    ...overrides,
  };
}

function fakeCorrection(overrides?: Partial<CorrectionPort>): CorrectionPort {
  return {
    capability: () => ({
      available: true,
      qualityTier: 'cloud-native',
      requiresConsentToSendText: true,
    }),
    correct: vi.fn().mockResolvedValue(correction),
    ...overrides,
  };
}

function collect() {
  const phases: string[] = [];
  return {
    phases,
    onState: (state: { phase: string }) => {
      phases.push(state.phase);
    },
  };
}

describe('pipeline runner (effects around the pure reducer)', () => {
  it('drives the full happy path from recording to READY', async () => {
    const { phases, onState } = collect();
    const runner = createPipelineRunner({
      transcription: fakeTranscription(),
      correction: fakeCorrection(),
      variant: 'en-US',
      onState,
    });

    runner.startRecording();
    await runner.finishRecording(clip);

    expect(phases).toEqual([
      'RECORDING',
      'TRANSCRIBING',
      'TRANSCRIBED',
      'CORRECTING',
      'CORRECTED',
      'READY',
    ]);
    expect(runner.state().phase).toBe('READY');
  });

  it('can record a new sentence after reaching READY', async () => {
    const { phases, onState } = collect();
    const runner = createPipelineRunner({
      transcription: fakeTranscription(),
      correction: fakeCorrection(),
      variant: 'en-US',
      onState,
    });

    runner.startRecording();
    await runner.finishRecording(clip);
    expect(runner.state().phase).toBe('READY');

    runner.startRecording();
    await runner.finishRecording({ ...clip, id: 'clip-2' });

    expect(runner.state().phase).toBe('READY');
    expect(phases).toEqual([
      'RECORDING',
      'TRANSCRIBING',
      'TRANSCRIBED',
      'CORRECTING',
      'CORRECTED',
      'READY',
      'RECORDING',
      'TRANSCRIBING',
      'TRANSCRIBED',
      'CORRECTING',
      'CORRECTED',
      'READY',
    ]);
  });

  it('surfaces an STT failure as FAILED_STT with the reason', async () => {
    const transcriptionPort = fakeTranscription({
      transcribe: vi.fn().mockRejectedValue(new Error('model crashed')),
    });
    const runner = createPipelineRunner({
      transcription: transcriptionPort,
      correction: fakeCorrection(),
      variant: 'en-US',
      onState: () => {},
    });

    runner.startRecording();
    await runner.finishRecording(clip);

    const state = runner.state();
    expect(state.phase).toBe('FAILED_STT');
    if (state.phase === 'FAILED_STT') {
      expect(state.reason).toContain('model crashed');
    }
  });

  it('retries transcription on demand and can reach READY', async () => {
    const transcribe = vi
      .fn()
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValue(transcription);
    const runner = createPipelineRunner({
      transcription: fakeTranscription({ transcribe }),
      correction: fakeCorrection(),
      variant: 'en-US',
      onState: () => {},
    });

    runner.startRecording();
    await runner.finishRecording(clip);
    expect(runner.state().phase).toBe('FAILED_STT');

    await runner.retry();

    expect(runner.state().phase).toBe('READY');
    expect(transcribe).toHaveBeenCalledTimes(2);
  });

  it('surfaces a correction failure as FAILED_LLM keeping the transcript', async () => {
    const runner = createPipelineRunner({
      transcription: fakeTranscription(),
      correction: fakeCorrection({
        correct: vi.fn().mockRejectedValue(new Error('egress refused: no-consent')),
      }),
      variant: 'en-US',
      onState: () => {},
    });

    runner.startRecording();
    await runner.finishRecording(clip);

    const state = runner.state();
    expect(state.phase).toBe('FAILED_LLM');
    if (state.phase === 'FAILED_LLM') {
      expect(state.reason).toContain('no-consent');
      expect(state.transcription.text).toBe(transcription.text);
    }
  });

  it('retries the correction only, without re-transcribing', async () => {
    const transcribe = vi.fn().mockResolvedValue(transcription);
    const correct = vi
      .fn()
      .mockRejectedValueOnce(new Error('provider 502'))
      .mockResolvedValue(correction);
    const runner = createPipelineRunner({
      transcription: fakeTranscription({ transcribe }),
      correction: fakeCorrection({ correct }),
      variant: 'en-US',
      onState: () => {},
    });

    runner.startRecording();
    await runner.finishRecording(clip);
    expect(runner.state().phase).toBe('FAILED_LLM');

    await runner.retry();

    expect(runner.state().phase).toBe('READY');
    expect(transcribe).toHaveBeenCalledTimes(1);
    expect(correct).toHaveBeenCalledTimes(2);
  });

  it('aborts back to IDLE from a failure', async () => {
    const runner = createPipelineRunner({
      transcription: fakeTranscription({
        transcribe: vi.fn().mockRejectedValue(new Error('nope')),
      }),
      correction: fakeCorrection(),
      variant: 'en-US',
      onState: () => {},
    });

    runner.startRecording();
    await runner.finishRecording(clip);
    runner.abort();

    expect(runner.state().phase).toBe('IDLE');
  });

  it('publishes one ErrorDetected per correction when reaching READY', async () => {
    const bus = createEventBus();
    const detected: DomainEvent[] = [];
    bus.subscribe('ErrorDetected', (event) => {
      detected.push(event);
    });
    const withErrors: CorrectionResult = {
      ...correction,
      corrections: [
        makeCorrection({
          original: 'I have make',
          fixed: 'I made',
          type: 'tense',
          explanation: 'past simple',
        }),
        makeCorrection({
          original: 'a deploy',
          fixed: 'a deployment',
          type: 'vocabulary',
          explanation: 'noun form',
        }),
      ],
    };
    const runner = createPipelineRunner({
      transcription: fakeTranscription(),
      correction: fakeCorrection({ correct: vi.fn().mockResolvedValue(withErrors) }),
      variant: 'en-US',
      onState: () => {},
      events: bus,
    });

    runner.startRecording();
    await runner.finishRecording(clip);

    expect(detected).toEqual([
      {
        kind: 'ErrorDetected',
        type: 'tense',
        value: { original: 'I have make', fixed: 'I made' },
      },
      {
        kind: 'ErrorDetected',
        type: 'vocabulary',
        value: { original: 'a deploy', fixed: 'a deployment' },
      },
    ]);
  });

  it('publishes SessionCompleted with the detected speech duration when reaching READY', async () => {
    const bus = createEventBus();
    const completed: DomainEvent[] = [];
    bus.subscribe('SessionCompleted', (event) => {
      completed.push(event);
    });
    const runner = createPipelineRunner({
      transcription: fakeTranscription(),
      correction: fakeCorrection(),
      variant: 'en-US',
      onState: () => {},
      events: bus,
    });

    runner.startRecording();
    await runner.finishRecording(clip);

    expect(completed).toEqual([{ kind: 'SessionCompleted', sessionId: 'clip-1', spokenMs: 1000 }]);
  });

  it('publishes nothing on failure and works without a bus', async () => {
    const bus = createEventBus();
    const detected: DomainEvent[] = [];
    bus.subscribe('ErrorDetected', (event) => {
      detected.push(event);
    });
    const failing = createPipelineRunner({
      transcription: fakeTranscription(),
      correction: fakeCorrection({ correct: vi.fn().mockRejectedValue(new Error('down')) }),
      variant: 'en-US',
      onState: () => {},
      events: bus,
    });

    failing.startRecording();
    await failing.finishRecording(clip);

    expect(failing.state().phase).toBe('FAILED_LLM');
    expect(detected).toEqual([]);
  });

  it('notifies READY with the session outcome for persistence', async () => {
    const onReady = vi.fn();
    const runner = createPipelineRunner({
      transcription: fakeTranscription(),
      correction: fakeCorrection(),
      variant: 'en-US',
      onState: () => {},
      onReady,
    });

    runner.startRecording();
    await runner.finishRecording(clip);

    expect(onReady).toHaveBeenCalledTimes(1);
    expect(onReady.mock.calls[0]?.[0]).toMatchObject({
      clipId: 'clip-1',
      transcription: { text: transcription.text },
      correction: { correctedText: 'Yesterday I deployed' },
    });
  });
});
