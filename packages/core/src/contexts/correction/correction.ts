import { CorrectionError } from './errors.ts';
import { isErrorType, type ErrorType } from './error-type.ts';
import { deepFreeze } from '../../shared/freeze.ts';

export interface WordSpan {
  readonly startWord: number;
  readonly endWord: number;
}

export interface Correction {
  readonly original: string;
  readonly fixed: string;
  readonly type: ErrorType;
  readonly explanation: string;
  readonly span?: WordSpan;
}

interface CorrectionParts {
  readonly original: string;
  readonly fixed: string;
  readonly type: string;
  readonly explanation: string;
  readonly span?: WordSpan;
}

function requireText(value: string, field: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new CorrectionError(`a correction needs a non-empty ${field}`);
  }
  return trimmed;
}

function validateSpan(span: WordSpan): WordSpan {
  if (
    !Number.isInteger(span.startWord) ||
    !Number.isInteger(span.endWord) ||
    span.startWord < 0 ||
    span.endWord < span.startWord
  ) {
    throw new CorrectionError('a word span needs 0 <= startWord <= endWord (integers)');
  }
  return { startWord: span.startWord, endWord: span.endWord };
}

export function makeCorrection(parts: CorrectionParts): Correction {
  if (!isErrorType(parts.type)) {
    throw new CorrectionError(`unknown error type: ${parts.type}`);
  }
  const correction: Correction = {
    original: requireText(parts.original, 'original'),
    fixed: requireText(parts.fixed, 'fixed'),
    type: parts.type,
    explanation: requireText(parts.explanation, 'explanation'),
    ...(parts.span === undefined ? {} : { span: validateSpan(parts.span) }),
  };
  return deepFreeze(correction);
}
