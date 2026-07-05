import { spawn } from 'node:child_process';

import type { EvalSubject } from './runner.ts';

// Sujet local : exerce le vrai chemin de correction de l'app via le bin Rust
// eval-correct (prompt Qwen3 + sidecar llama.cpp + extraction JSON). Aucun
// réseau — l'inférence est 100 % locale (invariant #1).
export function createLocalSubject(binPath: string, appDataDir: string): EvalSubject {
  return (input) =>
    new Promise((resolve, reject) => {
      const child = spawn(binPath, {
        env: { ...process.env, LOQUA_APP_DATA: appDataDir },
        stdio: ['pipe', 'pipe', 'inherit'],
      });
      let stdout = '';
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => {
        stdout += chunk;
      });
      child.on('error', reject);
      child.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`eval-correct exited with code ${code ?? -1}`));
          return;
        }
        // JSON malformé du modèle local = sortie invalide (mesurée par Zod),
        // pas une erreur de sujet : on renvoie le brut, le validateur tranche.
        try {
          resolve(JSON.parse(stdout.trim()));
        } catch {
          resolve(stdout.trim());
        }
      });
      child.stdin.write(JSON.stringify(input));
      child.stdin.end();
    });
}
