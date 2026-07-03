import { beforeEach, describe, expect, it } from 'vitest';

import { makeCard } from './card.ts';
import { CARDS_COLLECTION } from './error-card-policy.ts';
import { createReviewDeck } from './review-deck.ts';
import { createEventBus } from '../../events/event-bus.ts';
import { makeCardId } from '../../shared/ids.ts';
import type { Card } from './card.ts';
import type { EventBus } from '../../events/event-bus.ts';
import type { ClockPort, DomainEvent, StoragePort } from '../../index.ts';

const NOW = 1_700_000_000_000;
const DAY_MS = 86_400_000;

function fixedClock(nowMs = NOW): ClockPort {
  return { now: () => nowMs, timezone: () => 'Europe/Paris' };
}

function memoryStorage(): StoragePort {
  const collections = new Map<string, Map<string, unknown>>();
  const of = (collection: string): Map<string, unknown> => {
    const existing = collections.get(collection) ?? new Map<string, unknown>();
    collections.set(collection, existing);
    return existing;
  };
  return {
    read: <TValue,>(collection: string, id: string) =>
      Promise.resolve((of(collection).get(id) as TValue | undefined) ?? null),
    put: (collection, id, value) => {
      of(collection).set(id, value);
      return Promise.resolve();
    },
    query: <TValue,>(collection: string) => Promise.resolve([...of(collection).values()] as TValue[]),
    delete: (collection, id) => {
      of(collection).delete(id);
      return Promise.resolve();
    },
    eraseAll: () => {
      collections.clear();
      return Promise.resolve();
    },
  };
}

function wordCard(id: string, word: string, createdAtMs = NOW): Card {
  return makeCard({ id: makeCardId(id), item: { kind: 'word', word }, createdAtMs });
}

describe('review deck use-case (cards due today)', () => {
  let storage: StoragePort;
  let bus: EventBus;

  beforeEach(() => {
    storage = memoryStorage();
    bus = createEventBus();
  });

  it('lists only the cards due now, oldest due first', async () => {
    const dueOld = wordCard('card-a', 'deploy', NOW - 2 * DAY_MS);
    const dueRecent = wordCard('card-b', 'interesting', NOW - DAY_MS);
    const futureCard = makeCard({
      id: makeCardId('card-c'),
      item: { kind: 'word', word: 'later' },
      createdAtMs: NOW,
      scheduling: { ease: 2.5, intervalDays: 3, repetitions: 1, lapses: 0, dueAtMs: NOW + DAY_MS },
    });
    await storage.put(CARDS_COLLECTION, dueOld.id, dueOld);
    await storage.put(CARDS_COLLECTION, dueRecent.id, dueRecent);
    await storage.put(CARDS_COLLECTION, futureCard.id, futureCard);
    const deck = createReviewDeck({ storage, clock: fixedClock(), events: bus });

    const due = await deck.dueCards();

    expect(due.map((card) => card.id)).toEqual(['card-a', 'card-b']);
  });

  it('reschedules, persists and announces a reviewed card', async () => {
    const card = wordCard('card-a', 'deploy');
    await storage.put(CARDS_COLLECTION, card.id, card);
    const announced: DomainEvent[] = [];
    bus.subscribe('CardReviewed', (event) => {
      announced.push(event);
    });
    const deck = createReviewDeck({ storage, clock: fixedClock(), events: bus });

    const reviewed = await deck.review(card, 'good');

    expect(reviewed.scheduling.dueAtMs).toBe(NOW + DAY_MS);
    const persisted = await storage.read<Card>(CARDS_COLLECTION, card.id);
    expect(persisted?.scheduling.repetitions).toBe(1);
    expect(announced).toEqual([{ kind: 'CardReviewed', grade: 'good' }]);
  });

  it('takes a reviewed card out of the due list until its next due date', async () => {
    const card = wordCard('card-a', 'deploy');
    await storage.put(CARDS_COLLECTION, card.id, card);
    const deck = createReviewDeck({ storage, clock: fixedClock(), events: bus });

    await deck.review(card, 'good');

    expect(await deck.dueCards()).toEqual([]);
  });

  it('revalidates cards read from storage (boundary)', async () => {
    await storage.put(CARDS_COLLECTION, 'card-bad', {
      id: 'card-bad',
      item: { kind: 'word', word: '' },
      createdAtMs: NOW,
    });
    const deck = createReviewDeck({ storage, clock: fixedClock(), events: bus });

    await expect(deck.dueCards()).rejects.toThrow();
  });
});
