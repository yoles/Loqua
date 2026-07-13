import type { Consent } from '../contexts/identity/consent.ts';
import type { EventBus } from '../events/event-bus.ts';
import type { RuntimeCapability } from '../ports/runtime-capability.ts';

// LE point de sortie unique du contenu (invariants #1, #2, #5 — ARCHITECTURE §15).
// Aucun adapter réseau n'envoie de contenu sans une décision positive de ce guard.
// Tout nouveau flux réseau de contenu = extension d'egressGuard, jamais un contournement.

export type EgressPayload =
  { readonly kind: 'text'; readonly purpose: 'correction' } | { readonly kind: 'audio' };

export interface EgressRequest {
  readonly payload: EgressPayload;
  readonly cloudOptIn: boolean; // réglage « correction avancée » visible dans l'UI
  readonly capability: RuntimeCapability;
}

export type EgressRefusalReason =
  | 'audio-never-leaves'
  | 'no-consent'
  | 'not-opted-in'
  | 'adapter-unavailable'
  | 'not-an-egress-adapter';

export type EgressDecision =
  { readonly allowed: true } | { readonly allowed: false; readonly reason: EgressRefusalReason };

export interface EgressGuard {
  decide(request: EgressRequest): EgressDecision;
}

export function createEgressGuard(bus: EventBus, initialConsent: Consent | null): EgressGuard {
  let consent = initialConsent;
  bus.subscribe('ConsentChanged', (event) => {
    consent = event.consent;
  });

  return {
    decide(request) {
      // Invariant #1 : aucune combinaison de flags n'autorise l'audio à sortir.
      if (request.payload.kind === 'audio') {
        return { allowed: false, reason: 'audio-never-leaves' };
      }
      if (consent === null || !consent.cloudTextProcessing) {
        return { allowed: false, reason: 'no-consent' };
      }
      if (!request.cloudOptIn) {
        return { allowed: false, reason: 'not-opted-in' };
      }
      if (request.capability.requiresConsentToSendText !== true) {
        return { allowed: false, reason: 'not-an-egress-adapter' };
      }
      if (!request.capability.available) {
        return { allowed: false, reason: 'adapter-unavailable' };
      }
      return { allowed: true };
    },
  };
}
