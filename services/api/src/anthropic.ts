// Construction/parsing des échanges avec l'API Anthropic — fonctions PURES
// (testées sans réseau). Le serveur relaie : il ne lit ni ne journalise le contenu.
// La taxonomie vient de @loqua/core (ARCHITECTURE §9) — jamais redéfinie ici.

import { ERROR_TYPES } from '@loqua/core';

export const DEFAULT_CORRECTION_MODEL = 'claude-sonnet-5';

const CORRECTION_TOOL = {
  name: 'report_correction',
  description:
    'Report the corrected version of a spoken English utterance with each individual correction.',
  input_schema: {
    type: 'object',
    required: ['correctedText', 'corrections'],
    properties: {
      correctedText: { type: 'string', description: 'The full corrected utterance.' },
      corrections: {
        type: 'array',
        items: {
          type: 'object',
          required: ['original', 'fixed', 'type', 'explanation'],
          properties: {
            original: { type: 'string', description: 'The exact original fragment.' },
            fixed: { type: 'string', description: 'The corrected fragment.' },
            type: { type: 'string', enum: [...ERROR_TYPES] },
            explanation: {
              type: 'string',
              description: 'One short sentence explaining why, addressed to the learner.',
            },
          },
        },
      },
    },
  },
} as const;

const SYSTEM_PROMPT = `You are an English coach for professional software developers.
The user speaks English aloud; you receive the raw transcript of what they said.
Correct it to natural, professional spoken English (the "natural" level: fix real errors,
keep the speaker's voice — do not rewrite into formal prose, do not add content).
Focus on: grammar, tense, articles, word order, unnatural calques, vocabulary and idioms
as used in a software-engineering workplace (standups, code reviews, incidents).
If the transcript is already natural, return it unchanged with an empty corrections list.
Report via the report_correction tool only.`;

export interface CorrectionRequestInput {
  readonly text: string;
  readonly variant: 'en-US' | 'en-GB';
}

export function buildAnthropicRequest(
  input: CorrectionRequestInput,
  model: string,
): Record<string, unknown> {
  return {
    model,
    max_tokens: 1500,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Variant: ${input.variant}\nTranscript:\n${input.text}`,
      },
    ],
    tools: [CORRECTION_TOOL],
    tool_choice: { type: 'tool', name: CORRECTION_TOOL.name },
  };
}

// Extrait l'input du tool_use — relayé tel quel au client (qui valide avec Zod).
export function extractToolInput(responseBody: unknown): unknown | null {
  if (typeof responseBody !== 'object' || responseBody === null) {
    return null;
  }
  const content = (responseBody as { content?: unknown }).content;
  if (!Array.isArray(content)) {
    return null;
  }
  const toolUse = content.find(
    (block: unknown) =>
      typeof block === 'object' &&
      block !== null &&
      (block as { type?: unknown }).type === 'tool_use' &&
      (block as { name?: unknown }).name === CORRECTION_TOOL.name,
  );
  if (toolUse === undefined) {
    return null;
  }
  return (toolUse as { input?: unknown }).input ?? null;
}
