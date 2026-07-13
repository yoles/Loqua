import type { Card, ErrorType, ReviewGrade } from '@loqua/core';

// Libellés UI en français (le code reste en anglais).
export const GRADE_LABELS: Record<ReviewGrade, string> = {
  again: 'À revoir',
  hard: 'Difficile',
  good: 'Bien',
  easy: 'Facile',
};

export const ERROR_TYPE_LABELS: Record<ErrorType, string> = {
  tense: 'temps verbal',
  grammar: 'grammaire',
  vocabulary: 'vocabulaire',
  idiom: 'tournure idiomatique',
  syntax: 'syntaxe',
  'word-order': 'ordre des mots',
  article: 'article',
  register: 'registre de langue',
};

export interface ReviewCardView {
  readonly prompt: string;
  readonly answer: string;
  readonly categoryLabel: string | null;
}

export interface ReviewDeckView {
  readonly isLoading: boolean;
  readonly remaining: number;
  readonly current: ReviewCardView | null;
  readonly isDone: boolean;
}

function cardView(card: Card): ReviewCardView {
  if (card.item.kind === 'word') {
    return { prompt: card.item.word, answer: card.item.word, categoryLabel: null };
  }
  return {
    prompt: card.item.original,
    answer: card.item.fixed,
    categoryLabel: ERROR_TYPE_LABELS[card.item.type],
  };
}

export function reviewDeckView(due: readonly Card[] | null): ReviewDeckView {
  if (due === null) {
    return { isLoading: true, remaining: 0, current: null, isDone: false };
  }
  const current = due[0];
  return {
    isLoading: false,
    remaining: due.length,
    current: current === undefined ? null : cardView(current),
    isDone: due.length === 0,
  };
}
