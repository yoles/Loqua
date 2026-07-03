// shared
export { DomainError, SharedError, type BoundedContext } from './shared/domain-error.ts';
export { deepFreeze } from './shared/freeze.ts';
export {
  makeAttemptId,
  makeCardId,
  makeClipId,
  makeSessionId,
  type AttemptId,
  type CardId,
  type ClipId,
  type SessionId,
} from './shared/ids.ts';
export { makePhoneme, type Phoneme } from './shared/phoneme.ts';
export { VARIANTS, isVariant, type Variant } from './shared/variant.ts';

// correction
export { makeCorrection, type Correction, type WordSpan } from './contexts/correction/correction.ts';
export { ERROR_TYPES, isErrorType, type ErrorType } from './contexts/correction/error-type.ts';
export { CorrectionError } from './contexts/correction/errors.ts';
export { makeUtterance, type Utterance } from './contexts/correction/utterance.ts';

// pronunciation
export {
  makeScoreResult,
  makeUnscoredComparison,
  type PhonemeScore,
  type ScoreResult,
  type UnscoredComparison,
} from './contexts/pronunciation/comparison.ts';
export { PronunciationError } from './contexts/pronunciation/errors.ts';
export { makeWord, type Word } from './contexts/pronunciation/word.ts';

// srs
export { makeCard, type Card, type ReviewItem } from './contexts/srs/card.ts';
export { SrsError } from './contexts/srs/errors.ts';

// gamification
export { GamificationError } from './contexts/gamification/errors.ts';
export { makeStreak, type LocalDay, type Streak } from './contexts/gamification/streak.ts';
export { addXp, makeXp, type Xp } from './contexts/gamification/xp.ts';

// identity
export { makeConsent, type Consent } from './contexts/identity/consent.ts';
export { IdentityError } from './contexts/identity/errors.ts';
