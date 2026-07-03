import { beforeEach, describe, expect, it } from 'vitest';

import { attachErrorCardCreation, CARDS_COLLECTION } from './error-card-policy.ts';
import { reviewCard } from './card.ts';
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
    dump: (collection) => of(collection),
  };
}

function detect(bus: EventBus, original: string, fixed: string): void {
  bus.publish({ kind: 'ErrorDetected', type: 'tense', value: { original, fixed } });
}

describe('error → card policy (event bus → SRS)', () => {
  let bus: EventBus;
  let storage: ReturnType<typeof memoryStorage>;

  beforeEach(() => {
    bus = createEventBus();
    storage = memoryStorage();
  });

  it('creates a due card carrying a value copy of the detected error', async () => {
    const policy = attachErrorCardCreation(bus, { storage, clock: fixedClock() });

    detect(bus, 'I have make a deploy', 'I deployed');
    await policy.settled();

    const cards = [...storage.dump(CARDS_COLLECTION).values()] as Card[];
    expect(cards).toHaveLength(1);
    expect(cards[0]?.item).toEqual({
      kind: 'error',
      type: 'tense',
      original: 'I have make a deploy',
      fixed: 'I deployed',
    });
    expect(cards[0]?.scheduling.dueAtMs).toBe(NOW);
  });

  it('creates one card per distinct error', async () => {
    const policy = attachErrorCardCreation(bus, { storage, clock: fixedClock() });

    detect(bus, 'I have make', 'I made');
    detect(bus, 'a deploy', 'a deployment');
    await policy.settled();

    expect(storage.dump(CARDS_COLLECTION).size).toBe(2);
  });

  it('does not recreate a card for the same recurring error', async () => {
    const policy = attachErrorCardCreation(bus, { storage, clock: fixedClock() });

    detect(bus, 'I have make', 'I made');
    detect(bus, 'I have make', 'I made');
    await policy.settled();

    expect(storage.dump(CARDS_COLLECTION).size).toBe(1);
  });

  it('preserves the review progress of an existing card when the error recurs', async () => {
    const policy = attachErrorCardCreation(bus, { storage, clock: fixedClock() });
    detect(bus, 'I have make', 'I made');
    await policy.settled();
    const [id, stored] = [...storage.dump(CARDS_COLLECTION).entries()][0] as [string, Card];
    const reviewed = reviewCard(stored, 'good', NOW);
    await storage.put(CARDS_COLLECTION, id, reviewed);

    detect(bus, 'I have make', 'I made');
    await policy.settled();

    const after = storage.dump(CARDS_COLLECTION).get(id) as Card;
    expect(after.scheduling.repetitions).toBe(1);
  });

  it('keeps cards intact when the originating session is deleted (invariant #6)', async () => {
    const policy = attachErrorCardCreation(bus, { storage, clock: fixedClock() });
    await storage.put('sessions', 'session-1', { id: 'session-1' });
    detect(bus, 'I have make', 'I made');
    await policy.settled();

    await storage.delete('sessions', 'session-1');

    expect(storage.dump(CARDS_COLLECTION).size).toBe(1);
  });

  it('stops creating cards once detached', async () => {
    const policy = attachErrorCardCreation(bus, { storage, clock: fixedClock() });
    policy.detach();

    detect(bus, 'I have make', 'I made');
    await policy.settled();

    expect(storage.dump(CARDS_COLLECTION).size).toBe(0);
  });
});
