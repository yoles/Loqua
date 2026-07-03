import type { Consent } from '../contexts/identity/consent.ts';
import type { ErrorType } from '../contexts/correction/error-type.ts';
import type { ReviewGrade } from '../contexts/srs/review-grade.ts';

// Événements canoniques (ARCHITECTURE §7). Un événement transporte des
// copies de valeur immuables — jamais une entité mutable d'un autre contexte.
export type DomainEvent =
  | {
      readonly kind: 'SessionCompleted';
      readonly sessionId: string;
      readonly spokenMs: number; // parole détectée — consommé par la règle du streak
    }
  | {
      readonly kind: 'ErrorDetected';
      readonly type: ErrorType;
      readonly value: { readonly original: string; readonly fixed: string };
    }
  | { readonly kind: 'PronunciationValidated'; readonly word: string }
  | { readonly kind: 'SoundMissed'; readonly phoneme: string }
  | { readonly kind: 'CardReviewed'; readonly grade: ReviewGrade }
  | { readonly kind: 'ConsentChanged'; readonly consent: Consent };

export type EventKind = DomainEvent['kind'];

export type EventOfKind<TKind extends EventKind> = Extract<DomainEvent, { kind: TKind }>;
