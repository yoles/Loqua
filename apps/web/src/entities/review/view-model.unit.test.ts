import { describe, expect, it } from 'vitest';

import { ERROR_TYPES, makeCard, makeCardId } from '@loqua/core';

import { ERROR_TYPE_LABELS, GRADE_LABELS, reviewDeckView } from './view-model';

const NOW = 1_700_000_000_000;

function errorCard(id: string) {
  return makeCard({
    id: makeCardId(id),
    item: { kind: 'error', type: 'tense', original: 'I have make', fixed: 'I made' },
    createdAtMs: NOW,
  });
}

describe('review deck view-model', () => {
  it('reports loading before the deck is available', () => {
    const view = reviewDeckView(null);

    expect(view.isLoading).toBe(true);
    expect(view.current).toBeNull();
    expect(view.isDone).toBe(false);
  });

  it('presents the first due card with its French category label', () => {
    const view = reviewDeckView([errorCard('card-1'), errorCard('card-2')]);

    expect(view.remaining).toBe(2);
    expect(view.current).toEqual({
      prompt: 'I have make',
      answer: 'I made',
      categoryLabel: 'temps verbal',
    });
  });

  it('reports the deck as done when nothing is due', () => {
    const view = reviewDeckView([]);

    expect(view.isDone).toBe(true);
    expect(view.current).toBeNull();
  });

  it('labels a register error card in French instead of leaking the raw identifier', () => {
    const card = makeCard({
      id: makeCardId('card-register'),
      item: { kind: 'error', type: 'register', original: 'gonna do it', fixed: 'going to do it' },
      createdAtMs: NOW,
    });

    const view = reviewDeckView([card]);

    expect(view.current?.categoryLabel).toBe('registre de langue');
  });

  it('labels every error type of the taxonomy in French', () => {
    expect(Object.keys(ERROR_TYPE_LABELS).sort()).toEqual([...ERROR_TYPES].sort());
  });

  it('labels every review grade in French', () => {
    expect(GRADE_LABELS).toEqual({
      again: 'À revoir',
      hard: 'Difficile',
      good: 'Bien',
      easy: 'Facile',
    });
  });
});
