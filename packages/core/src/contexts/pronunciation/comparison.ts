import { PronunciationError } from './errors.ts';
import { deepFreeze } from '../../shared/freeze.ts';

export interface PhonemeScore {
  readonly phoneme: string;
  readonly score: number; // 0..100
}

export interface ScoreResult {
  readonly kind: 'scored';
  readonly overall: number; // 0..100
  readonly phonemes: readonly PhonemeScore[];
  readonly worstSyllableIndex?: number;
}

// Le socle V1 (ear-compare) : pas de score, juste les deux clips à confronter.
// Spike #2 = NO-GO sur le scoring chiffré non-supervisé — voir SPIKES §7.
export interface UnscoredComparison {
  readonly kind: 'unscored';
  readonly referenceClipId: string;
  readonly userClipId: string;
}

function requireClipId(value: string, field: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new PronunciationError(`an unscored comparison needs a non-empty ${field}`);
  }
  return trimmed;
}

export function makeUnscoredComparison(parts: {
  referenceClipId: string;
  userClipId: string;
}): UnscoredComparison {
  return deepFreeze({
    kind: 'unscored' as const,
    referenceClipId: requireClipId(parts.referenceClipId, 'referenceClipId'),
    userClipId: requireClipId(parts.userClipId, 'userClipId'),
  });
}

function requireScore(value: number, field: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new PronunciationError(`${field} must be within 0..100, got ${value}`);
  }
  return value;
}

export function makeScoreResult(parts: {
  overall: number;
  phonemes: readonly PhonemeScore[];
  worstSyllableIndex?: number;
}): ScoreResult {
  const result: ScoreResult = {
    kind: 'scored',
    overall: requireScore(parts.overall, 'overall'),
    phonemes: parts.phonemes.map((entry) => ({
      phoneme: entry.phoneme,
      score: requireScore(entry.score, `score of phoneme "${entry.phoneme}"`),
    })),
    ...(parts.worstSyllableIndex === undefined
      ? {}
      : { worstSyllableIndex: parts.worstSyllableIndex }),
  };
  return deepFreeze(result);
}
