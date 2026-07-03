// CLI d'évaluation : `pnpm --filter @loqua/eval eval [N]`
// Prérequis : services/api en local (`pnpm --filter @loqua/api dev`) + clé dans .dev.vars.
// Coût/latence notés à chaque run ; baseline commitée (traçabilité, règle §16).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { GOLDEN_SET } from './golden-set/cases.ts';
import { judgeCase, type JudgeVerdict } from './llm-judge.ts';
import { runEval } from './runner.ts';
import { validateCorrectionOutput } from './validator.ts';

const API_URL = process.env['EVAL_API_URL'] ?? 'http://localhost:8787/v1/correction';
const JUDGE_KEY = process.env['ANTHROPIC_API_KEY'];
const JUDGE_SAMPLE = 10;

async function main(): Promise<void> {
  const n = Number(process.argv[2] ?? GOLDEN_SET.length);
  const cases = GOLDEN_SET.slice(0, n);
  console.log(`Eval correction — ${cases.length} cas via ${API_URL}`);

  const startedAt = Date.now();
  const report = await runEval(
    cases,
    async (input) => {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!response.ok) {
        throw new Error(`API ${response.status}`);
      }
      return response.json();
    },
    validateCorrectionOutput,
  );
  const durationMs = Date.now() - startedAt;

  console.log(`\n=== RÉSULTATS (${(durationMs / 1000).toFixed(1)}s) ===`);
  console.log(`Cas passés          : ${report.passed}/${report.total}`);
  console.log(`Sorties invalides   : ${report.invalidOutputs}`);
  console.log(`Erreurs sujet       : ${report.subjectErrors}`);
  console.log('Taux de détection par type :');
  for (const [type, rate] of Object.entries(report.detectionRateByType)) {
    console.log(`  ${type.padEnd(12)} ${(rate * 100).toFixed(0)}%`);
  }
  const failed = report.cases.filter((entry) => entry.outcome !== 'passed');
  if (failed.length > 0) {
    console.log('\nCas en échec :');
    for (const entry of failed) {
      console.log(`  ${entry.caseId}: ${entry.outcome} (manqué: ${entry.missedTypes.join(', ')})`);
    }
  }

  // LLM-juge sur un échantillon (qualité des explications / du texte corrigé).
  let verdicts: JudgeVerdict[] = [];
  if (JUDGE_KEY !== undefined && JUDGE_KEY.length > 0) {
    const judged = cases.slice(0, JUDGE_SAMPLE);
    console.log(`\nLLM-juge sur ${judged.length} cas…`);
    for (const goldenCase of judged) {
      const raw = await fetch(API_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(goldenCase.input),
      }).then((r) => r.json());
      const validated = validateCorrectionOutput(raw);
      if (validated !== null) {
        verdicts.push(await judgeCase(goldenCase, validated, JUDGE_KEY));
      }
    }
    const avg = verdicts.reduce((sum, v) => sum + v.score, 0) / Math.max(verdicts.length, 1);
    console.log(`Score juge moyen : ${avg.toFixed(2)}/5`);
  } else {
    console.log('\n(LLM-juge sauté : ANTHROPIC_API_KEY absent de l’environnement)');
  }

  // Baseline commitée — la non-régression compare les runs futurs à ce fichier.
  const resultsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'results');
  mkdirSync(resultsDir, { recursive: true });
  const baseline = {
    ranAt: new Date().toISOString(),
    apiUrl: API_URL,
    durationMs,
    total: report.total,
    passed: report.passed,
    invalidOutputs: report.invalidOutputs,
    subjectErrors: report.subjectErrors,
    detectionRateByType: report.detectionRateByType,
    judge: verdicts,
    failedCases: failed.map((entry) => ({ id: entry.caseId, outcome: entry.outcome })),
  };
  const path = join(resultsDir, 'baseline.json');
  writeFileSync(path, `${JSON.stringify(baseline, null, 2)}\n`);
  console.log(`\nBaseline écrite : ${path}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
