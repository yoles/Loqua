// Construit le sidecar LLM (llm-sidecar) et le publie comme externalBin Tauri.
// Nécessaire car le sidecar est un crate séparé (whisper-rs et llama-cpp-2 ne
// peuvent pas être linkés ensemble) : Tauri ne le compile pas tout seul.
// Debug → target/debug (résolu via current_exe en `tauri dev`) ;
// --release → binaries/<triple> pour le bundle (externalBin).
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const release = process.argv.includes('--release');
const scriptDir = dirname(fileURLToPath(import.meta.url));
const tauriDir = join(scriptDir, '..', 'src-tauri');

function run(command, args) {
  const result = spawnSync(command, args, { cwd: tauriDir, stdio: 'inherit' });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function hostTriple() {
  const out = spawnSync('rustc', ['-vV'], { encoding: 'utf8' });
  const line = (out.stdout ?? '').split('\n').find((l) => l.startsWith('host:'));
  if (line === undefined) {
    console.error('cannot detect host target triple via rustc -vV');
    process.exit(1);
  }
  return line.slice('host:'.length).trim();
}

const profileArgs = release ? ['--release'] : [];
run('cargo', ['build', '-p', 'loqua-llm-sidecar', ...profileArgs]);

const isWindows = process.platform === 'win32';
const binName = isWindows ? 'loqua-llm-sidecar.exe' : 'loqua-llm-sidecar';
const builtPath = join(tauriDir, 'target', release ? 'release' : 'debug', binName);

const triple = hostTriple();
const suffix = isWindows ? '.exe' : '';
const destPath = join(tauriDir, 'binaries', `loqua-llm-sidecar-${triple}${suffix}`);
mkdirSync(dirname(destPath), { recursive: true });
copyFileSync(builtPath, destPath);
console.log(`sidecar prêt : ${destPath}`);
