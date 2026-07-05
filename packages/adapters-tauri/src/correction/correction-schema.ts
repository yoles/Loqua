import { z } from 'zod';

import { ERROR_TYPES } from '@loqua/core';

// Schéma Zod de la sortie LLM local (frontière) — vit à côté de l'adapter qu'il
// protège. Volontairement identique au schéma cloud : même contrat de sortie,
// deux runtimes différents (le core reçoit la même forme, quel que soit le tier).
export const localCorrectionPayloadSchema = z.object({
  correctedText: z.string().min(1),
  corrections: z.array(
    z.object({
      original: z.string().min(1),
      fixed: z.string().min(1),
      type: z.enum(ERROR_TYPES),
      explanation: z.string().min(1),
      span: z
        .object({
          startWord: z.number().int().min(0),
          endWord: z.number().int().min(0),
        })
        .optional(),
    }),
  ),
});

export type LocalCorrectionPayload = z.infer<typeof localCorrectionPayloadSchema>;
