import { makeCard } from './card.ts';
import { fnv1a } from '../../shared/hash.ts';
import { makeCardId } from '../../shared/ids.ts';
import type { Card } from './card.ts';
import type { EventBus, Unsubscribe } from '../../events/event-bus.ts';
import type { EventOfKind } from '../../events/domain-events.ts';
import type { ClockPort } from '../../ports/clock-port.ts';
import type { StoragePort } from '../../ports/storage-port.ts';

export const CARDS_COLLECTION = 'cards';

export interface ErrorCardPolicyDeps {
  readonly storage: StoragePort;
  readonly clock: ClockPort;
}

export interface ErrorCardPolicy {
  detach(): void;
  settled(): Promise<void>;
}

// Id dérivé du contenu : la même erreur récurrente retombe sur la MÊME carte
// (pas de doublon, et surtout pas de remise à zéro de son scheduling).
function cardIdFor(event: EventOfKind<'ErrorDetected'>): string {
  return `card-${event.type}-${fnv1a(`${event.value.original}|${event.value.fixed}`)}`;
}

async function createCardIfAbsent(
  event: EventOfKind<'ErrorDetected'>,
  deps: ErrorCardPolicyDeps,
): Promise<void> {
  const id = cardIdFor(event);
  const existing = await deps.storage.read<Card>(CARDS_COLLECTION, id);
  if (existing !== null) {
    return;
  }
  const card = makeCard({
    id: makeCardId(id),
    item: {
      kind: 'error',
      type: event.type,
      original: event.value.original,
      fixed: event.value.fixed,
    },
    createdAtMs: deps.clock.now(),
  });
  await deps.storage.put(CARDS_COLLECTION, id, card);
}

export function attachErrorCardCreation(
  bus: EventBus,
  deps: ErrorCardPolicyDeps,
): ErrorCardPolicy {
  // Le bus est synchrone, le storage asynchrone : les créations s'enchaînent
  // dans l'ordre d'arrivée ; `settled()` attend la fin (tests, teardown).
  let queue: Promise<void> = Promise.resolve();

  const unsubscribe: Unsubscribe = bus.subscribe('ErrorDetected', (event) => {
    queue = queue.then(() => createCardIfAbsent(event, deps));
  });

  return {
    detach: unsubscribe,
    settled: () => queue,
  };
}
