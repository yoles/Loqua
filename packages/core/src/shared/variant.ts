export const VARIANTS = ['en-US', 'en-GB'] as const;

export type Variant = (typeof VARIANTS)[number];

export function isVariant(value: string): value is Variant {
  return (VARIANTS as readonly string[]).includes(value);
}
