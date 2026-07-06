import type { RuntimeCapability } from './runtime-capability.ts';
import type { Variant } from '../shared/variant.ts';

// Transcription IPA d'un mot (aide à la prononciation, lot 5.2). L'IPA fait
// autorité pour la prononciation ; la syllabation épelée reste une heuristique.
export interface PhonemizerPort {
  capability(): RuntimeCapability;
  toIpa(input: { word: string; variant: Variant }): Promise<string>;
}
