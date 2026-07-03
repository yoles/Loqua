import type { CorrectionResult, ErrorType } from '@loqua/core';

import type { GoldenCase } from './golden-set/types.ts';

// Le sujet évalué : typiquement un CorrectionPort branché sur un vrai modèle.
// Il renvoie une sortie BRUTE (unknown) : le malformé fait partie de la mesure.
export type EvalSubject = (input: GoldenCase['input']) => Promise<unknown>;

// La validation de forme (Zod au lot 2.4) est injectée : null = sortie invalide.
export type OutputValidator = (raw: unknown) => CorrectionResult | null;

export interface CaseResult {
  readonly caseId: string;
  readonly outcome: 'passed' | 'missed-detections' | 'invalid-output' | 'subject-error';
  readonly missedTypes: readonly ErrorType[];
  readonly detectedTypes: readonly ErrorType[];
}

export interface EvalReport {
  readonly total: number;
  readonly passed: number;
  readonly invalidOutputs: number;
  readonly subjectErrors: number;
  readonly detectionRateByType: Readonly<Record<string, number>>;
  readonly cases: readonly CaseResult[];
}

function detectionOutcome(goldenCase: GoldenCase, result: CorrectionResult): CaseResult {
  const detectedTypes = [...new Set(result.corrections.map((correction) => correction.type))];
  const missedTypes = goldenCase.mustDetect.filter((type) => !detectedTypes.includes(type));
  return {
    caseId: goldenCase.id,
    outcome: missedTypes.length === 0 ? 'passed' : 'missed-detections',
    missedTypes,
    detectedTypes,
  };
}

export async function runEval(
  goldenSet: readonly GoldenCase[],
  subject: EvalSubject,
  validate: OutputValidator,
): Promise<EvalReport> {
  const cases: CaseResult[] = [];

  for (const goldenCase of goldenSet) {
    let raw: unknown;
    try {
      raw = await subject(goldenCase.input);
    } catch {
      cases.push({
        caseId: goldenCase.id,
        outcome: 'subject-error',
        missedTypes: goldenCase.mustDetect,
        detectedTypes: [],
      });
      continue;
    }

    const validated = validate(raw);
    if (validated === null) {
      // Sortie invalide (schéma non respecté) = échec comptabilisé, pas une exception.
      cases.push({
        caseId: goldenCase.id,
        outcome: 'invalid-output',
        missedTypes: goldenCase.mustDetect,
        detectedTypes: [],
      });
      continue;
    }

    cases.push(detectionOutcome(goldenCase, validated));
  }

  return {
    total: cases.length,
    passed: cases.filter((entry) => entry.outcome === 'passed').length,
    invalidOutputs: cases.filter((entry) => entry.outcome === 'invalid-output').length,
    subjectErrors: cases.filter((entry) => entry.outcome === 'subject-error').length,
    detectionRateByType: detectionRates(goldenSet, cases),
    cases,
  };
}

function detectionRates(
  goldenSet: readonly GoldenCase[],
  cases: readonly CaseResult[],
): Readonly<Record<string, number>> {
  const expectedCounts = new Map<ErrorType, number>();
  const detectedCounts = new Map<ErrorType, number>();

  for (const goldenCase of goldenSet) {
    const result = cases.find((entry) => entry.caseId === goldenCase.id);
    for (const type of goldenCase.mustDetect) {
      expectedCounts.set(type, (expectedCounts.get(type) ?? 0) + 1);
      if (result !== undefined && !result.missedTypes.includes(type)) {
        detectedCounts.set(type, (detectedCounts.get(type) ?? 0) + 1);
      }
    }
  }

  const rates: Record<string, number> = {};
  for (const [type, expected] of expectedCounts) {
    rates[type] = (detectedCounts.get(type) ?? 0) / expected;
  }
  return rates;
}
