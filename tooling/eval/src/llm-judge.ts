// LLM-juge (ARCHITECTURE §16) — le SEUL endroit des tests autorisé à appeler le réseau.
// Juge la qualité du texte corrigé et des explications, jamais utilisé en test unitaire.
import type { GoldenCase } from './golden-set/types.ts';
import type { CorrectionResult } from '@loqua/core';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_JUDGE_MODEL = 'claude-haiku-4-5';

export interface JudgeVerdict {
  readonly caseId: string;
  readonly score: number; // 1 (inutilisable) .. 5 (excellent)
  readonly reason: string;
}

const JUDGE_TOOL = {
  name: 'report_verdict',
  description: 'Report the quality verdict for one corrected utterance.',
  input_schema: {
    type: 'object',
    required: ['score', 'reason'],
    properties: {
      score: { type: 'integer', minimum: 1, maximum: 5 },
      reason: { type: 'string' },
    },
  },
} as const;

export async function judgeCase(
  goldenCase: GoldenCase,
  result: CorrectionResult,
  apiKey: string,
  model = DEFAULT_JUDGE_MODEL,
): Promise<JudgeVerdict> {
  const prompt = `You are grading an English-correction tool for developers.

Original (spoken, with mistakes): ${goldenCase.input.text}
Human reference correction: ${goldenCase.referenceCorrection}
Tool's corrected text: ${result.correctedText}
Tool's explanations: ${result.corrections.map((c) => `[${c.type}] ${c.original} → ${c.fixed}: ${c.explanation}`).join(' | ')}

Grade 1-5: is the corrected text natural professional spoken English, faithful to the
speaker's intent, and are the explanations short, correct and helpful to a learner?
Semantic equivalence with the reference is enough — exact wording does not matter.`;

  const response = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
      tools: [JUDGE_TOOL],
      tool_choice: { type: 'tool', name: JUDGE_TOOL.name },
    }),
  });
  if (!response.ok) {
    throw new Error(`judge call failed with status ${response.status}`);
  }

  const body = (await response.json()) as {
    content?: { type: string; name?: string; input?: { score?: number; reason?: string } }[];
  };
  const toolUse = body.content?.find((block) => block.type === 'tool_use');
  const score = toolUse?.input?.score;
  if (typeof score !== 'number') {
    throw new Error('judge returned no score');
  }
  return { caseId: goldenCase.id, score, reason: toolUse?.input?.reason ?? '' };
}
