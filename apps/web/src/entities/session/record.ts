import type { Correction, QualityTier, Variant } from '@loqua/core';

// Document persisté dans StoragePort ('sessions') — copies de valeur uniquement.
export interface SessionRecord {
  readonly id: string;
  readonly createdAtMs: number;
  readonly variant: Variant;
  readonly originalText: string;
  readonly correctedText: string;
  readonly corrections: readonly Correction[];
  readonly qualityTier: QualityTier;
}
