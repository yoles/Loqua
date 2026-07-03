import { describe, expect, it } from 'vitest';

import { createEventBus } from './event-bus.ts';
import type { DomainEvent } from './domain-events.ts';

const errorDetected: DomainEvent = {
  kind: 'ErrorDetected',
  type: 'grammar',
  value: { original: 'I have make a deploy', fixed: 'I deployed' },
};

const sessionCompleted: DomainEvent = {
  kind: 'SessionCompleted',
  sessionId: 'session-1',
  spokenMs: 90_000,
};

describe('in-process domain event bus', () => {
  it('delivers an event to the subscribers of its kind only', () => {
    const bus = createEventBus();
    const received: DomainEvent[] = [];
    const wrongKind: DomainEvent[] = [];
    bus.subscribe('ErrorDetected', (event) => received.push(event));
    bus.subscribe('SessionCompleted', (event) => wrongKind.push(event));

    bus.publish(errorDetected);

    expect(received).toHaveLength(1);
    expect(received[0]?.kind).toBe('ErrorDetected');
    expect(wrongKind).toHaveLength(0);
  });

  it('delivers to subscribers in subscription order', () => {
    const bus = createEventBus();
    const order: string[] = [];
    bus.subscribe('SessionCompleted', () => order.push('first'));
    bus.subscribe('SessionCompleted', () => order.push('second'));

    bus.publish(sessionCompleted);

    expect(order).toEqual(['first', 'second']);
  });

  it('stops delivering after unsubscribe', () => {
    const bus = createEventBus();
    let calls = 0;
    const unsubscribe = bus.subscribe('SessionCompleted', () => {
      calls += 1;
    });

    bus.publish(sessionCompleted);
    unsubscribe();
    bus.publish(sessionCompleted);

    expect(calls).toBe(1);
  });

  it('delivers immutable value copies (frozen events)', () => {
    const bus = createEventBus();
    let delivered: DomainEvent | undefined;
    bus.subscribe('ErrorDetected', (event) => {
      delivered = event;
    });

    bus.publish(errorDetected);

    expect(delivered).toBeDefined();
    expect(Object.isFrozen(delivered)).toBe(true);
    expect(Object.isFrozen((delivered as { value: object }).value)).toBe(true);
  });

  it('does not deliver the current event to a subscriber added mid-dispatch', () => {
    const bus = createEventBus();
    let lateCalls = 0;
    bus.subscribe('SessionCompleted', () => {
      bus.subscribe('SessionCompleted', () => {
        lateCalls += 1;
      });
    });

    bus.publish(sessionCompleted);

    expect(lateCalls).toBe(0);
  });
});
