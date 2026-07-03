import { z } from 'zod';

import type { OutputValidator } from './runner.ts';
import type { CorrectionResult } from '@loqua/core';

// Schéma local au harness (le CLI tourne sans runtime core — imports types only).
const payloadSchema = z.object({
  correctedText: z.string().min(1),
  corrections: z.array(
    z.object({
      original: z.string().min(1),
      fixed: z.string().min(1),
      type: z.enum([
        'grammar',
        'syntax',
        'vocabulary',
        'idiom',
        'register',
        'word-order',
        'article',
        'tense',
      ]),
      explanation: z.string().min(1),
    }),
  ),
});

export const validateCorrectionOutput: OutputValidator = (raw) => {
  const parsed = payloadSchema.safeParse(raw);
  if (!parsed.success) {
    return null;
  }
  const result: CorrectionResult = {
    variant: 'en-US',
    correctedText: parsed.data.correctedText,
    corrections: parsed.data.corrections,
    qualityTier: 'cloud-native',
  };
  return result;
};
