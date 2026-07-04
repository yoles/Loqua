// beforeDevCommand idempotent : réutilise un `next dev` déjà lancé sur :3000
// (Next 16 refuse deux serveurs dev sur le même dossier), sinon le démarre.
import { spawn } from 'node:child_process';

const DEV_URL = 'http://localhost:3000';

const alreadyServing = await fetch(DEV_URL)
  .then((response) => response.ok)
  .catch(() => false);

if (alreadyServing) {
  console.log(`frontend already served at ${DEV_URL} — reusing it`);
  process.exit(0);
}

const child = spawn('pnpm', ['--filter', '@loqua/web', 'dev'], { stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 0));
