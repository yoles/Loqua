import type { ErrorType, Variant } from '@loqua/core';

// Un cas du golden set : énoncé fautif « dev » + ce que la correction DOIT détecter.
// Assertion sémantique (« l'erreur de temps est détectée »), jamais d'égalité stricte.
export interface GoldenCase {
  readonly id: string;
  readonly scenario: 'standup' | 'code-review' | 'incident' | 'interview' | 'archi';
  readonly input: { readonly text: string; readonly variant: Variant };
  readonly mustDetect: readonly ErrorType[];
  readonly referenceCorrection: string; // repère humain — jamais comparé à l'identique
}
