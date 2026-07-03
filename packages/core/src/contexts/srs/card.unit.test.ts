import { describe, expect, it } from 'vitest';

import { SrsError } from './errors.ts';
import { makeCard } from './card.ts';
import { makeCardId } from '../../shared/ids.ts';

describe('Card aggregate (value-copy invariant #6)', () => {
  it('stores a word item as a value copy', () => {
    const card = makeCard({
      id: makeCardId('card-1'),
      item: { kind: 'word', word: 'interesting' },
      createdAtMs: 1_700_000_000_000,
    });

    expect(card.item).toEqual({ kind: 'word', word: 'interesting' });
    expect(Object.isFrozen(card)).toBe(true);
    expect(Object.isFrozen(card.item)).toBe(true);
  });

  it('stores an error item as a value copy of the correction', () => {
    const card = makeCard({
      id: makeCardId('card-2'),
      item: {
        kind: 'error',
        type: 'grammar',
        original: 'I have make a deploy',
        fixed: 'I deployed',
      },
      createdAtMs: 1_700_000_000_000,
    });

    expect(card.item.kind).toBe('error');
    expect(Object.isFrozen(card.item)).toBe(true);
  });

  it('carries no reference to any session (erasure by design)', () => {
    const card = makeCard({
      id: makeCardId('card-3'),
      item: { kind: 'word', word: 'deploy' },
      createdAtMs: 0,
    });

    expect('sessionId' in card).toBe(false);
    expect('session' in card).toBe(false);
  });

  it('rejects an empty word item', () => {
    expect(() =>
      makeCard({ id: makeCardId('card-4'), item: { kind: 'word', word: ' ' }, createdAtMs: 0 }),
    ).toThrow(SrsError);
  });

  it('rejects a negative creation timestamp', () => {
    expect(() =>
      makeCard({ id: makeCardId('card-5'), item: { kind: 'word', word: 'bug' }, createdAtMs: -1 }),
    ).toThrow(SrsError);
  });
});
