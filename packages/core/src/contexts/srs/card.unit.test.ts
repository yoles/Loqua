import { describe, expect, it } from 'vitest';

import { SrsError } from './errors.ts';
import { makeCard, reviewCard } from './card.ts';
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

describe('Card review behaviour (SM-2 scheduling on the aggregate)', () => {
  const NOW = 1_700_000_000_000;
  const DAY_MS = 86_400_000;

  function newCard() {
    return makeCard({
      id: makeCardId('card-r1'),
      item: { kind: 'word', word: 'deploy' },
      createdAtMs: NOW,
    });
  }

  it('creates a card immediately due for review', () => {
    const card = newCard();

    expect(card.scheduling.dueAtMs).toBe(NOW);
    expect(card.scheduling.repetitions).toBe(0);
  });

  it('returns a new frozen card on review, leaving the original untouched', () => {
    const card = newCard();

    const reviewed = reviewCard(card, 'good', NOW);

    expect(reviewed).not.toBe(card);
    expect(Object.isFrozen(reviewed)).toBe(true);
    expect(reviewed.scheduling.dueAtMs).toBe(NOW + DAY_MS);
    expect(card.scheduling.dueAtMs).toBe(NOW);
  });

  it('keeps id and item identical through reviews', () => {
    const card = newCard();

    const reviewed = reviewCard(reviewCard(card, 'good', NOW), 'again', NOW + DAY_MS);

    expect(reviewed.id).toBe(card.id);
    expect(reviewed.item).toEqual(card.item);
    expect(reviewed.scheduling.lapses).toBe(1);
  });

  it('rebuilds a card from persisted scheduling', () => {
    const persisted = makeCard({
      id: makeCardId('card-r2'),
      item: { kind: 'word', word: 'interesting' },
      createdAtMs: NOW,
      scheduling: { ease: 2.5, intervalDays: 6, repetitions: 2, lapses: 1, dueAtMs: NOW + DAY_MS },
    });

    expect(persisted.scheduling.intervalDays).toBe(6);
    expect(persisted.scheduling.lapses).toBe(1);
  });
});
