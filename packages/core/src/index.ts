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
export { syllabify } from './contexts/pronunciation/syllable.ts';
export {
  attachPronunciationCardCreation,
  type PronunciationCardPolicy,
} from './contexts/srs/pronunciation-card-policy.ts';

// srs
export { makeCard, reviewCard, type Card, type ReviewItem } from './contexts/srs/card.ts';
export { SrsError } from './contexts/srs/errors.ts';
export { REVIEW_GRADES, type ReviewGrade } from './contexts/srs/review-grade.ts';
export {
  applyReview,
  initialScheduling,
  isDue,
  makeScheduling,
  SCHEDULING_RULES,
  type Scheduling,
} from './contexts/srs/scheduling.ts';
export {
  attachErrorCardCreation,
  CARDS_COLLECTION,
  type ErrorCardPolicy,
  type ErrorCardPolicyDeps,
} from './contexts/srs/error-card-policy.ts';
export {
  createReviewDeck,
  type ReviewDeck,
  type ReviewDeckDeps,
} from './contexts/srs/review-deck.ts';

// events
export type { DomainEvent, EventKind, EventOfKind } from './events/domain-events.ts';
export { createEventBus, type EventBus, type Unsubscribe } from './events/event-bus.ts';

// gamification
export { GamificationError } from './contexts/gamification/errors.ts';
export { makeStreak, type LocalDay, type Streak } from './contexts/gamification/streak.ts';
export {
  addXp,
  makeXp,
  XP_RULES,
  xpForCardReview,
  xpForSession,
  type Xp,
} from './contexts/gamification/xp.ts';
export { localDayOf, previousDay } from './contexts/gamification/local-day.ts';
export {
  applySpeech,
  freshDailyProgress,
  STREAK_RULES,
  type DailyProgress,
  type SpeechApplication,
  type SpeechOutcome,
} from './contexts/gamification/streak-rule.ts';
export {
  attachGamification,
  GAMIFICATION_COLLECTION,
  type GamificationPolicy,
  type GamificationPolicyDeps,
  type GamificationState,
} from './contexts/gamification/gamification-policy.ts';

// identity
export { makeConsent, type Consent } from './contexts/identity/consent.ts';
export { IdentityError } from './contexts/identity/errors.ts';

// egress (point de sortie unique du contenu)
export {
  createEgressGuard,
  type EgressDecision,
  type EgressGuard,
  type EgressPayload,
  type EgressRefusalReason,
  type EgressRequest,
} from './egress/egress-guard.ts';

// pipeline
export { PipelineError } from './pipeline/errors.ts';
export {
  INITIAL_PIPELINE_STATE,
  transition,
  type PipelineEvent,
  type PipelineState,
} from './pipeline/pipeline.ts';
export {
  createPipelineRunner,
  type PipelineRunner,
  type PipelineRunnerDeps,
  type ReadySession,
} from './pipeline/runner.ts';

// ports (contrats §9 — source de vérité technique)
export type { AudioClip, AudioFormat } from './ports/audio-clip.ts';
export type { ClockPort } from './ports/clock-port.ts';
export type { CorrectionPort, CorrectionResult } from './ports/correction-port.ts';
export type {
  ModelDescriptor,
  ModelRuntimePort,
  ModelTask,
} from './ports/model-runtime-port.ts';
export type { PronunciationScoringPort } from './ports/pronunciation-scoring-port.ts';
export type { QualityTier, RuntimeCapability } from './ports/runtime-capability.ts';
export type { SpeechSynthesisPort } from './ports/speech-synthesis-port.ts';
export type { PhonemizerPort } from './ports/phonemizer-port.ts';
export type { StoragePort } from './ports/storage-port.ts';
export type {
  TranscriptionPort,
  TranscriptionResult,
  WordTiming,
} from './ports/transcription-port.ts';
