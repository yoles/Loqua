import { SrsError } from './errors.ts';
import { applyReview, initialScheduling, makeScheduling } from './scheduling.ts';
import { deepFreeze } from '../../shared/freeze.ts';
import type { CardId } from '../../shared/ids.ts';
import type { ErrorType } from '../correction/error-type.ts';
import type { ReviewGrade } from './review-grade.ts';
import type { Scheduling } from './scheduling.ts';

// Invariant #6 : la Card stocke une COPIE DE VALEUR de l'item —
// jamais une référence vers la Session (droit à l'effacement by design).
export type ReviewItem =
  | { readonly kind: 'word'; readonly word: string }
  | {
      readonly kind: 'error';
      readonly type: ErrorType;
      readonly original: string;
      readonly fixed: string;
    };

export interface Card {
  readonly id: CardId;
  readonly item: ReviewItem;
  readonly createdAtMs: number;
  readonly scheduling: Scheduling;
}

function validateItem(item: ReviewItem): ReviewItem {
  if (item.kind === 'word') {
    const word = item.word.trim();
    if (word.length === 0) {
      throw new SrsError('a word card needs a non-empty word');
    }
    return { kind: 'word', word };
  }
  const original = item.original.trim();
  const fixed = item.fixed.trim();
  if (original.length === 0 || fixed.length === 0) {
    throw new SrsError('an error card needs non-empty original and fixed texts');
  }
  return { kind: 'error', type: item.type, original, fixed };
}

export function makeCard(parts: {
  id: CardId;
  item: ReviewItem;
  createdAtMs: number;
  scheduling?: Scheduling;
}): Card {
  if (!Number.isFinite(parts.createdAtMs) || parts.createdAtMs < 0) {
    throw new SrsError('a card needs a non-negative creation timestamp');
  }
  return deepFreeze({
    id: parts.id,
    item: validateItem(parts.item),
    createdAtMs: parts.createdAtMs,
    scheduling:
      parts.scheduling === undefined
        ? initialScheduling(parts.createdAtMs)
        : makeScheduling(parts.scheduling),
  });
}

export function reviewCard(card: Card, grade: ReviewGrade, nowMs: number): Card {
  return deepFreeze({
    id: card.id,
    item: card.item,
    createdAtMs: card.createdAtMs,
    scheduling: applyReview(card.scheduling, grade, nowMs),
  });
}
