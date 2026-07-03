import { beforeEach, describe, expect, it } from 'vitest';

import { attachGamification, GAMIFICATION_COLLECTION } from './gamification-policy.ts';
import { XP_RULES } from './xp.ts';
import { createEventBus } from '../../events/event-bus.ts';
import type { GamificationState } from './gamification-policy.ts';
import type { EventBus } from '../../events/event-bus.ts';
import type { ClockPort, StoragePort } from '../../index.ts';

// 2026-07-03 12:00 UTC — 14:00 à Paris.
const NOON_UTC = Date.UTC(2026, 6, 3, 12, 0);
const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;

function adjustableClock(startMs: number): ClockPort & { advance(ms: number): void } {
  let nowMs = startMs;
  return {
    now: () => nowMs,
    timezone: () => 'Europe/Paris',
    advance(ms: number) {
      nowMs += ms;
    },
  };
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

async function stateOf(storage: StoragePort): Promise<GamificationState> {
  const state = await storage.read<GamificationState>(GAMIFICATION_COLLECTION, 'state');
  if (state === null) {
    throw new Error('gamification state missing');
  }
  return state;
}

function completeSession(bus: EventBus, spokenMs: number): void {
  bus.publish({ kind: 'SessionCompleted', sessionId: 'session-1', spokenMs });
}

describe('gamification policy (event-driven only)', () => {
  let bus: EventBus;
  let storage: StoragePort;
  let clock: ReturnType<typeof adjustableClock>;

  beforeEach(() => {
    bus = createEventBus();
    storage = memoryStorage();
    clock = adjustableClock(NOON_UTC);
  });

  it('accumulates speech across sessions and earns the streak at 60 s', async () => {
    const policy = attachGamification(bus, { storage, clock });

    completeSession(bus, 40_000);
    completeSession(bus, 20_000);
    await policy.settled();

    const state = await stateOf(storage);
    expect(state.streak.days).toBe(1);
    expect(state.progress.spokenMs).toBe(MINUTE_MS);
  });

  it('extends the streak on the next local day', async () => {
    const policy = attachGamification(bus, { storage, clock });
    completeSession(bus, MINUTE_MS);
    await policy.settled();

    clock.advance(DAY_MS);
    completeSession(bus, MINUTE_MS);
    await policy.settled();

    const state = await stateOf(storage);
    expect(state.streak.days).toBe(2);
  });

  it('awards XP for completed sessions and reviewed cards', async () => {
    const policy = attachGamification(bus, { storage, clock });

    completeSession(bus, 10_000);
    bus.publish({ kind: 'CardReviewed', grade: 'good' });
    await policy.settled();

    const state = await stateOf(storage);
    expect(state.xp).toBe(XP_RULES.PER_SESSION + XP_RULES.PER_CARD_REVIEW);
  });

  it('resumes from the persisted state instead of starting over', async () => {
    const first = attachGamification(bus, { storage, clock });
    completeSession(bus, MINUTE_MS);
    await first.settled();
    first.detach();

    const second = attachGamification(bus, { storage, clock });
    bus.publish({ kind: 'CardReviewed', grade: 'easy' });
    await second.settled();

    const state = await stateOf(storage);
    expect(state.streak.days).toBe(1);
    expect(state.xp).toBe(XP_RULES.PER_SESSION + XP_RULES.PER_CARD_REVIEW);
  });

  it('ignores events after detach', async () => {
    const policy = attachGamification(bus, { storage, clock });
    policy.detach();

    completeSession(bus, MINUTE_MS);
    await policy.settled();

    const state = await storage.read<GamificationState>(GAMIFICATION_COLLECTION, 'state');
    expect(state).toBeNull();
  });
});
