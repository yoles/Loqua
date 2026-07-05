// CLI d'évaluation : `pnpm --filter @loqua/eval eval [N]`
// Cloud (défaut) : services/api en local (`pnpm --filter @loqua/api dev`) + clé dans .dev.vars.
// Local  : EVAL_SUBJECT=local + LOQUA_EVAL_CORRECT (bin) + LOQUA_APP_DATA (dir modèles).
// Coût/latence notés à chaque run ; baseline commitée (traçabilité, règle §16).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { GOLDEN_SET } from './golden-set/cases.ts';
import { judgeCase, type JudgeVerdict } from './llm-judge.ts';
import { createLocalSubject } from './local-subject.ts';
import { runEval, type EvalSubject } from './runner.ts';
import { validateCorrectionOutput } from './validator.ts';

const API_URL = process.env['EVAL_API_URL'] ?? 'http://localhost:8787/v1/correction';
const JUDGE_KEY = process.env['ANTHROPIC_API_KEY'];
const JUDGE_SAMPLE = 10;

const SUBJECT_MODE = process.env['EVAL_SUBJECT'] === 'local' ? 'local' : 'cloud';

function cloudSubject(): EvalSubject {
  return async (input) => {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      throw new Error(`API ${response.status}`);
    }
    return response.json();
  };
}

function localSubject(): EvalSubject {
  const bin = process.env['LOQUA_EVAL_CORRECT'];
  const appData = process.env['LOQUA_APP_DATA'];
  if (bin === undefined || appData === undefined) {
    throw new Error('EVAL_SUBJECT=local requires LOQUA_EVAL_CORRECT and LOQUA_APP_DATA');
  }
  return createLocalSubject(bin, appData);
}

async function main(): Promise<void> {
  const n = Number(process.argv[2] ?? GOLDEN_SET.length);
  const cases = GOLDEN_SET.slice(0, n);
  const subject = SUBJECT_MODE === 'local' ? localSubject() : cloudSubject();
  const source = SUBJECT_MODE === 'local' ? 'local (Qwen3-8B via sidecar)' : API_URL;
  console.log(`Eval correction — ${cases.length} cas via ${source}`);

  const startedAt = Date.now();
  const report = await runEval(cases, subject, validateCorrectionOutput);
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
  const verdicts: JudgeVerdict[] = [];
  if (JUDGE_KEY !== undefined && JUDGE_KEY.length > 0) {
    const judged = cases.slice(0, JUDGE_SAMPLE);
    console.log(`\nLLM-juge sur ${judged.length} cas…`);
    for (const goldenCase of judged) {
      const raw = await subject(goldenCase.input);
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

  // Baseline commitée — fichier distinct par tier pour comparer local vs cloud.
  const resultsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'results');
  mkdirSync(resultsDir, { recursive: true });
  const baseline = {
    ranAt: new Date().toISOString(),
    subject: source,
    durationMs,
    total: report.total,
    passed: report.passed,
    invalidOutputs: report.invalidOutputs,
    subjectErrors: report.subjectErrors,
    detectionRateByType: report.detectionRateByType,
    judge: verdicts,
    failedCases: failed.map((entry) => ({ id: entry.caseId, outcome: entry.outcome })),
  };
  const fileName = SUBJECT_MODE === 'local' ? 'baseline-local.json' : 'baseline.json';
  const path = join(resultsDir, fileName);
  writeFileSync(path, `${JSON.stringify(baseline, null, 2)}\n`);
  console.log(`\nBaseline écrite : ${path}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
