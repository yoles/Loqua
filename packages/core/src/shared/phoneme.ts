import { SharedError } from './domain-error.ts';
import { deepFreeze } from './freeze.ts';

export interface Phoneme {
  readonly ipa: string;
}

export function makePhoneme(rawIpa: string): Phoneme {
  const ipa = rawIpa.trim();
  if (ipa.length === 0) {
    throw new SharedError('a phoneme needs a non-empty IPA symbol');
  }
  return deepFreeze({ ipa });
}
