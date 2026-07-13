import { ERROR_TYPES } from '@loqua/core';
import { z } from 'zod';

import type { OutputValidator } from './runner.ts';
import type { CorrectionResult } from '@loqua/core';

// Schéma local au harness ; la taxonomie vient de @loqua/core (ARCHITECTURE §9)
// — jamais redéfinie ici.
const payloadSchema = z.object({
  correctedText: z.string().min(1),
  corrections: z.array(
    z.object({
      original: z.string().min(1),
      fixed: z.string().min(1),
      type: z.enum(ERROR_TYPES),
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
