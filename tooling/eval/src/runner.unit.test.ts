import { describe, expect, it } from 'vitest';

import { SAMPLE_GOLDEN_SET } from './golden-set/sample.ts';
import { runEval, type OutputValidator } from './runner.ts';
import { makeCorrection, type CorrectionResult } from '@loqua/core';

// Sujet FACTICE déterministe : on teste le harness lui-même, pas un modèle.
const perfectSubject = (input: { text: string }): Promise<CorrectionResult> =>
  Promise.resolve({
    variant: 'en-US',
    correctedText: input.text,
    corrections: [
      makeCorrection({
        original: 'x',
        fixed: 'y',
        type: 'grammar',
        explanation: 'fake',
      }),
      makeCorrection({
        original: 'x',
        fixed: 'y',
        type: 'syntax',
        explanation: 'fake',
      }),
      makeCorrection({
        original: 'x',
        fixed: 'y',
        type: 'word-order',
        explanation: 'fake',
      }),
    ],
    qualityTier: 'local-basic',
  });

const acceptAll: OutputValidator = (raw) => raw as CorrectionResult;

describe('eval runner (skeleton proven on placeholder cases)', () => {
  it('passes every case when the subject detects all expected types', async () => {
    const report = await runEval(SAMPLE_GOLDEN_SET, perfectSubject, acceptAll);

    expect(report.total).toBe(2);
    expect(report.passed).toBe(2);
    expect(report.detectionRateByType['grammar']).toBe(1);
  });

  it('counts missed detections per error type', async () => {
    const blindSubject = (): Promise<CorrectionResult> =>
      Promise.resolve({
        variant: 'en-US',
        correctedText: 'unchanged',
        corrections: [],
        qualityTier: 'local-basic',
      });

    const report = await runEval(SAMPLE_GOLDEN_SET, blindSubject, acceptAll);

    expect(report.passed).toBe(0);
    expect(report.cases.every((entry) => entry.outcome === 'missed-detections')).toBe(true);
    expect(report.detectionRateByType['grammar']).toBe(0);
  });

  it('counts an invalid output as a failure, not an exception', async () => {
    const malformedSubject = (): Promise<unknown> => Promise.resolve('not json at all');
    const strictValidator: OutputValidator = () => null;

    const report = await runEval(SAMPLE_GOLDEN_SET, malformedSubject, strictValidator);

    expect(report.invalidOutputs).toBe(2);
    expect(report.passed).toBe(0);
  });

  it('isolates a crashing subject into a counted failure', async () => {
    const crashingSubject = (): Promise<unknown> => Promise.reject(new Error('boom'));

    const report = await runEval(SAMPLE_GOLDEN_SET, crashingSubject, acceptAll);

    expect(report.subjectErrors).toBe(2);
  });
});
