import { CARDS_COLLECTION } from './error-card-policy.ts';
import { makeCard } from './card.ts';
import { fnv1a } from '../../shared/hash.ts';
import { makeCardId } from '../../shared/ids.ts';
import type { Card } from './card.ts';
import type { EventBus, Unsubscribe } from '../../events/event-bus.ts';
import type { EventOfKind } from '../../events/domain-events.ts';
import type { ClockPort } from '../../ports/clock-port.ts';
import type { StoragePort } from '../../ports/storage-port.ts';

export interface PronunciationCardPolicyDeps {
  readonly storage: StoragePort;
  readonly clock: ClockPort;
}

export interface PronunciationCardPolicy {
  detach(): void;
  settled(): Promise<void>;
}

// Id dérivé du mot (insensible à la casse) : pratiquer deux fois le même mot
// retombe sur la MÊME carte — pas de doublon ni de reset de son scheduling.
function cardIdFor(word: string): string {
  return `card-word-${fnv1a(word.trim().toLowerCase())}`;
}

async function createCardIfAbsent(
  event: EventOfKind<'PronunciationValidated'>,
  deps: PronunciationCardPolicyDeps,
): Promise<void> {
  const id = cardIdFor(event.word);
  const existing = await deps.storage.read<Card>(CARDS_COLLECTION, id);
  if (existing !== null) {
    return;
  }
  const card = makeCard({
    id: makeCardId(id),
    item: { kind: 'word', word: event.word },
    createdAtMs: deps.clock.now(),
  });
  await deps.storage.put(CARDS_COLLECTION, id, card);
}

export function attachPronunciationCardCreation(
  bus: EventBus,
  deps: PronunciationCardPolicyDeps,
): PronunciationCardPolicy {
  // Bus synchrone, storage asynchrone : créations enchaînées dans l'ordre ;
  // `settled()` attend la fin (tests, teardown).
  let queue: Promise<void> = Promise.resolve();

  const unsubscribe: Unsubscribe = bus.subscribe('PronunciationValidated', (event) => {
    queue = queue.then(() => createCardIfAbsent(event, deps));
  });

  return {
    detach: unsubscribe,
    settled: () => queue,
  };
}
