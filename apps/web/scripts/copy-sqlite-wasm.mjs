// Copie la dist de @sqlite.org/sqlite-wasm vers public/sqlite-wasm/ (gitignoré).
// Servie en statique + importée nativement au runtime : le bundler n'y touche pas.
import { cpSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const pkg = dirname(require.resolve('@sqlite.org/sqlite-wasm/package.json'));
const target = join(here, '..', 'public', 'sqlite-wasm');

mkdirSync(target, { recursive: true });
cpSync(join(pkg, 'dist'), target, { recursive: true });
console.log(`sqlite-wasm dist → ${target}`);
