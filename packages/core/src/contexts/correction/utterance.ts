import { CorrectionError } from './errors.ts';
import { deepFreeze } from '../../shared/freeze.ts';
import type { Variant } from '../../shared/variant.ts';

export interface Utterance {
  readonly text: string;
  readonly variant: Variant;
}

export function makeUtterance(parts: { text: string; variant: Variant }): Utterance {
  const text = parts.text.trim();
  if (text.length === 0) {
    throw new CorrectionError('an utterance needs non-empty text');
  }
  return deepFreeze({ text, variant: parts.variant });
}
