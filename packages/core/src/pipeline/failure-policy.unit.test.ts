import { describe, expect, it } from 'vitest';

import { FAILURE_POLICY, nextFailureAction } from './failure-policy.ts';
import type { FailedPipelineState, FailureRecoveryOptions } from './failure-policy.ts';

const transcription = { text: 'yesterday I have make a deploy', words: [], language: 'en' };

function failedStt(attempts: number): FailedPipelineState {
  return { phase: 'FAILED_STT', clipId: 'clip-1', reason: 'model crashed', attempts };
}

function failedLlm(attempts: number): FailedPipelineState {
  return {
    phase: 'FAILED_LLM',
    clipId: 'clip-1',
    transcription,
    reason: 'provider 502',
    attempts,
  };
}

const NO_RECOVERY: FailureRecoveryOptions = {
  canDegradeToLocal: false,
  canOfferCloudOptIn: false,
};

const FULL_RECOVERY: FailureRecoveryOptions = {
  canDegradeToLocal: true,
  canOfferCloudOptIn: true,
};

describe('pipeline failure policy (retry, then degrade local, then cloud opt-in)', () => {
  it('retries while the attempt count stays under the limit', () => {
    expect(nextFailureAction(failedStt(1), NO_RECOVERY)).toBe('retry');
    expect(nextFailureAction(failedLlm(FAILURE_POLICY.maxAttempts - 1), NO_RECOVERY)).toBe('retry');
  });

  it('stops retrying once the attempt limit is reached', () => {
    expect(nextFailureAction(failedStt(FAILURE_POLICY.maxAttempts), FULL_RECOVERY)).not.toBe(
      'retry',
    );
    expect(nextFailureAction(failedLlm(FAILURE_POLICY.maxAttempts), NO_RECOVERY)).not.toBe('retry');
  });

  it('asks the user after exhausted STT retries whatever the recovery options', () => {
    expect(nextFailureAction(failedStt(FAILURE_POLICY.maxAttempts), FULL_RECOVERY)).toBe(
      'ask-user',
    );
  });

  it('degrades to the local adapter after exhausted LLM retries when one is available', () => {
    expect(nextFailureAction(failedLlm(FAILURE_POLICY.maxAttempts), FULL_RECOVERY)).toBe(
      'degrade-local',
    );
  });

  it('offers the cloud opt-in after exhausted LLM retries when no local adapter can take over', () => {
    expect(
      nextFailureAction(failedLlm(FAILURE_POLICY.maxAttempts), {
        canDegradeToLocal: false,
        canOfferCloudOptIn: true,
      }),
    ).toBe('offer-cloud-optin');
  });

  it('asks the user when neither degrading nor the cloud opt-in is possible', () => {
    expect(nextFailureAction(failedLlm(FAILURE_POLICY.maxAttempts), NO_RECOVERY)).toBe('ask-user');
  });
});
