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
  // `reference` (audio de référence TTS) sert au chemin unscored ear-compare
  // (A/B) ; le futur chemin scored analyse `audio` vs `targetWord`/`ipa`.
  score(input: {
    audio: AudioClip;
    targetWord: string;
    reference?: AudioClip;
    ipa?: string;
  }): Promise<ScoreResult | UnscoredComparison>;
}
