import { makeCard, reviewCard } from './card.ts';
import { CARDS_COLLECTION } from './error-card-policy.ts';
import { isDue } from './scheduling.ts';
import { makeCardId } from '../../shared/ids.ts';
import type { Card } from './card.ts';
import type { ReviewGrade } from './review-grade.ts';
import type { EventBus } from '../../events/event-bus.ts';
import type { ClockPort } from '../../ports/clock-port.ts';
import type { StoragePort } from '../../ports/storage-port.ts';

export interface ReviewDeckDeps {
  readonly storage: StoragePort;
  readonly clock: ClockPort;
  readonly events: EventBus;
}

export interface ReviewDeck {
  dueCards(): Promise<readonly Card[]>;
  review(card: Card, grade: ReviewGrade): Promise<Card>;
}

// Le storage lu est une frontière : reconstruire via l'agrégat (validation).
function rehydrate(raw: Card): Card {
  return makeCard({
    id: makeCardId(raw.id),
    item: raw.item,
    createdAtMs: raw.createdAtMs,
    scheduling: raw.scheduling,
  });
}

export function createReviewDeck(deps: ReviewDeckDeps): ReviewDeck {
  return {
    async dueCards(): Promise<readonly Card[]> {
      const stored = await deps.storage.query<Card>(CARDS_COLLECTION, {});
      const nowMs = deps.clock.now();
      return stored
        .map(rehydrate)
        .filter((card) => isDue(card.scheduling, nowMs))
        .sort((a, b) => a.scheduling.dueAtMs - b.scheduling.dueAtMs);
    },

    async review(card: Card, grade: ReviewGrade): Promise<Card> {
      const reviewed = reviewCard(card, grade, deps.clock.now());
      await deps.storage.put(CARDS_COLLECTION, reviewed.id, reviewed);
      deps.events.publish({ kind: 'CardReviewed', grade });
      return reviewed;
    },
  };
}
