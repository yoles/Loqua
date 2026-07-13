import type { PronunciationScoringPort, RuntimeCapability, UnscoredComparison } from '@loqua/core';

const CAPABILITY: RuntimeCapability = {
  available: true,
  qualityTier: 'local-basic',
};

// ear-compare (Spike #2 = NO-GO sur le scoring chiffré) : AUCUN score, on
// confronte juste les deux clips (référence TTS vs enregistrement) pour une
// écoute A/B. Adapter dégénéré : pas de lib technique, il emballe les ids.
export function createEarCompareScoringPort(): PronunciationScoringPort {
  return {
    capability(): RuntimeCapability {
      return CAPABILITY;
    },

    async score(input): Promise<UnscoredComparison> {
      if (input.reference === undefined) {
        throw new Error('ear-compare requires a reference clip for A/B comparison');
      }
      return {
        kind: 'unscored',
        referenceClipId: input.reference.id,
        userClipId: input.audio.id,
      };
    },
  };
}
