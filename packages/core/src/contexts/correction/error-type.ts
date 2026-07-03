// Taxonomie fixée par ARCHITECTURE §9 — toute évolution passe par la spec.
export const ERROR_TYPES = [
  'grammar',
  'syntax',
  'vocabulary',
  'idiom',
  'register',
  'word-order',
  'article',
  'tense',
] as const;

export type ErrorType = (typeof ERROR_TYPES)[number];

export function isErrorType(value: string): value is ErrorType {
  return (ERROR_TYPES as readonly string[]).includes(value);
}
