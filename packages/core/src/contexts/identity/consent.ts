import { IdentityError } from './errors.ts';
import { deepFreeze } from '../../shared/freeze.ts';

// Consentement explicite (RGPD art. 9 pour le micro/biométrie).
// decidedAtMs vient TOUJOURS d'un ClockPort injecté — le core n'invente jamais l'heure.
export interface Consent {
  readonly microphone: boolean;
  readonly cloudTextProcessing: boolean;
  readonly decidedAtMs: number;
}

export function makeConsent(parts: {
  microphone: boolean;
  cloudTextProcessing: boolean;
  decidedAtMs: number;
}): Consent {
  if (!Number.isFinite(parts.decidedAtMs) || parts.decidedAtMs < 0) {
    throw new IdentityError('a consent needs a non-negative decision timestamp');
  }
  return deepFreeze({
    microphone: parts.microphone,
    cloudTextProcessing: parts.cloudTextProcessing,
    decidedAtMs: parts.decidedAtMs,
  });
}
