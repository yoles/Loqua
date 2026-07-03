import type { AudioClip } from './audio-clip.ts';
import type { RuntimeCapability } from './runtime-capability.ts';
import type {
  ScoreResult,
  UnscoredComparison,
} from '../contexts/pronunciation/comparison.ts';

// Retourne UnscoredComparison par défaut (Spike #2 = NO-GO sur le scoring
// chiffré non-supervisé) ; ScoreResult est réservé à la piste R&D supervisée.
export interface PronunciationScoringPort {
  capability(): RuntimeCapability;
  score(input: {
    audio: AudioClip;
    targetWord: string;
    ipa?: string;
  }): Promise<ScoreResult | UnscoredComparison>;
}
