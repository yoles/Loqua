import { deepFreeze } from '../shared/freeze.ts';
import type { DomainEvent, EventKind, EventOfKind } from './domain-events.ts';

export type Unsubscribe = () => void;

export interface EventBus {
  publish(event: DomainEvent): void;
  subscribe<TKind extends EventKind>(
    kind: TKind,
    handler: (event: EventOfKind<TKind>) => void,
  ): Unsubscribe;
}

type AnyHandler = (event: DomainEvent) => void;

export function createEventBus(): EventBus {
  const handlersByKind = new Map<EventKind, AnyHandler[]>();

  return {
    publish(event) {
      const frozen = deepFreeze(event);
      // Copie du tableau : un abonnement pendant le dispatch ne reçoit pas l'événement courant.
      const handlers = [...(handlersByKind.get(event.kind) ?? [])];
      for (const handler of handlers) {
        handler(frozen);
      }
    },

    subscribe(kind, handler) {
      const handlers = handlersByKind.get(kind) ?? [];
      const anyHandler = handler as AnyHandler;
      handlersByKind.set(kind, [...handlers, anyHandler]);
      return () => {
        const current = handlersByKind.get(kind) ?? [];
        handlersByKind.set(
          kind,
          current.filter((registered) => registered !== anyHandler),
        );
      };
    },
  };
}
