import type { RuntimeCapability, QualityTier } from './runtime-capability.ts';
import type { Correction } from '../contexts/correction/correction.ts';
import type { Variant } from '../shared/variant.ts';

export interface CorrectionResult {
  readonly variant: Variant;
  readonly correctedText: string;
  readonly corrections: readonly Correction[];
  readonly qualityTier: QualityTier; // le core le connaît et le restitue à l'UI
}

export interface CorrectionPort {
  capability(): RuntimeCapability;
  correct(input: { text: string; variant: Variant }): Promise<CorrectionResult>;
  // NB : 'level' (minimal/naturel/natif) est hors MVP — 'naturel' seulement.
}
