import type { PipelineState } from './pipeline.ts';

// Politique d'échec du pipeline (ARCHITECTURE §10) : retry N fois, sinon
// dégrader vers un adapter local, sinon proposer l'opt-in cloud — décidée ICI,
// jamais improvisée par une app. Après épuisement des retries STT, la seule
// issue est de demander à l'utilisateur : l'audio ne bascule JAMAIS vers le
// cloud (invariant #1).
export const FAILURE_POLICY = {
  maxAttempts: 3,
} as const;

export type FailedPipelineState = Extract<PipelineState, { phase: 'FAILED_STT' | 'FAILED_LLM' }>;

export type FailureAction = 'retry' | 'degrade-local' | 'offer-cloud-optin' | 'ask-user';

// Sondes décrites par le composition root (quels adapters existent ici) ;
// la décision reste dans cette policy.
export interface FailureRecoveryOptions {
  readonly canDegradeToLocal: boolean;
  readonly canOfferCloudOptIn: boolean;
}

export function nextFailureAction(
  state: FailedPipelineState,
  recovery: FailureRecoveryOptions,
): FailureAction {
  if (state.attempts < FAILURE_POLICY.maxAttempts) {
    return 'retry';
  }
  if (state.phase === 'FAILED_STT') {
    return 'ask-user';
  }
  if (recovery.canDegradeToLocal) {
    return 'degrade-local';
  }
  if (recovery.canOfferCloudOptIn) {
    return 'offer-cloud-optin';
  }
  return 'ask-user';
}
