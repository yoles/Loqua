// Harness d'évaluation des briques IA (ARCHITECTURE §16).
// Golden set réel + LLM-juge + baseline : lot 2.5.
export { SAMPLE_GOLDEN_SET } from './golden-set/sample.ts';
export type { GoldenCase } from './golden-set/types.ts';
export {
  runEval,
  type CaseResult,
  type EvalReport,
  type EvalSubject,
  type OutputValidator,
} from './runner.ts';
