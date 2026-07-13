import { beforeEach, describe, expect, it } from 'vitest';

import { attachPronunciationCardCreation } from './pronunciation-card-policy.ts';
import { CARDS_COLLECTION } from './error-card-policy.ts';
import { createEventBus } from '../../events/event-bus.ts';
import type { Card } from './card.ts';
import type { EventBus } from '../../events/event-bus.ts';
import type { ClockPort, StoragePort } from '../../index.ts';

const NOW = 1_700_000_000_000;

function fixedClock(nowMs = NOW): ClockPort {
  return { now: () => nowMs, timezone: () => 'Europe/Paris' };
}

function memoryStorage(): StoragePort & { dump(collection: string): Map<string, unknown> } {
  const collections = new Map<string, Map<string, unknown>>();
  const of = (collection: string): Map<string, unknown> => {
    const existing = collections.get(collection) ?? new Map<string, unknown>();
    collections.set(collection, existing);
    return existing;
  };
  return {
    read: <TValue>(collection: string, id: string) =>
      Promise.resolve((of(collection).get(id) as TValue | undefined) ?? null),
    put: (collection, id, value) => {
      of(collection).set(id, value);
      return Promise.resolve();
    },
    query: <TValue>(collection: string) =>
      Promise.resolve([...of(collection).values()] as TValue[]),
    delete: (collection, id) => {
      of(collection).delete(id);
      return Promise.resolve();
    },
    eraseAll: () => {
      collections.clear();
      return Promise.resolve();
    },
    dump: (collection) => of(collection),
  };
}

describe('practiced word → card policy (event bus → SRS)', () => {
  let bus: EventBus;
  let storage: ReturnType<typeof memoryStorage>;

  beforeEach(() => {
    bus = createEventBus();
    storage = memoryStorage();
  });

  it('creates a due word card when a word is practiced', async () => {
    const policy = attachPronunciationCardCreation(bus, { storage, clock: fixedClock() });

    bus.publish({ kind: 'PronunciationValidated', word: 'interesting' });
    await policy.settled();

    const cards = [...storage.dump(CARDS_COLLECTION).values()] as Card[];
    expect(cards).toHaveLength(1);
    expect(cards[0]?.item).toEqual({ kind: 'word', word: 'interesting' });
    expect(cards[0]?.scheduling.dueAtMs).toBe(NOW);
  });

  it('does not duplicate a card for the same word (case-insensitive)', async () => {
    const policy = attachPronunciationCardCreation(bus, { storage, clock: fixedClock() });

    bus.publish({ kind: 'PronunciationValidated', word: 'Deploy' });
    bus.publish({ kind: 'PronunciationValidated', word: 'deploy' });
    await policy.settled();

    expect([...storage.dump(CARDS_COLLECTION).values()]).toHaveLength(1);
  });

  it('stops creating cards after detach', async () => {
    const policy = attachPronunciationCardCreation(bus, { storage, clock: fixedClock() });
    policy.detach();

    bus.publish({ kind: 'PronunciationValidated', word: 'rollback' });
    await policy.settled();

    expect([...storage.dump(CARDS_COLLECTION).values()]).toHaveLength(0);
  });
});
