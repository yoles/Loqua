import { PronunciationError } from './errors.ts';
import { deepFreeze } from '../../shared/freeze.ts';

export interface Word {
  readonly text: string;
}

export function makeWord(rawText: string): Word {
  const text = rawText.trim();
  if (text.length === 0) {
    throw new PronunciationError('a word needs non-empty text');
  }
  if (/\s/.test(text)) {
    throw new PronunciationError(`a word cannot contain whitespace: "${text}"`);
  }
  return deepFreeze({ text });
}
