# Loqua — instructions pour l'agent

Coach vocal d'anglais **privacy-first** : STT/TTS/scoring 100 % locaux, seul du texte peut sortir (cloud-ZDR, opt-in). Monorepo pnpm + Turborepo : `packages/core` (TS pur, hexagonal, 5 bounded contexts) · `packages/adapters-web` / `adapters-tauri` · `packages/ui-web` · `apps/web` (Next.js + FSD) · `apps/desktop` (Tauri 2) · `services/api` (Hono/CF Workers) · `tooling/eval`.

## Sources de vérité (dans cet ordre)

1. `specs/ARCHITECTURE.md` — décisions fermes ; en cas de doute, elle prime
2. `specs/SPRINTS.md` — plan d'exécution (ordre impératif)
3. `.claude/rules/` — règles opérationnelles détaillées

## Protocole avant de coder (obligatoire)

1. Ouvrir **`.claude/rules/INDEX.md`**
2. Identifier la tâche dans le tableau « Par tâche »
3. Lire **uniquement** les fichiers de règles listés pour cette tâche, puis coder

## Règles toujours actives (résumé — détail dans les fichiers)

- **Invariants §1 jamais violés** : audio jamais hors de l'appareil · texte sortant = opt-in via `egressGuard` uniquement · serveur aveugle · fallback jamais silencieux · effacement by design (copies de valeur). Conflit tâche↔invariant → **s'arrêter et remonter**.
- **Règle de dépendance** : la flèche pointe toujours vers `core`. Zéro logique métier hors `core`. Port avant adapter, toujours.
- **`core` pur** : pas de React/DOM/Node/`fetch` ; pas de `Date.now()`/`Math.random()` (→ `ClockPort`/injection).
- **Deux régimes de test, jamais mélangés** : TDD (Vitest) sur le déterministe · eval harness sur l'IA. Jamais d'`expect(...).toBe(...)` sur une sortie de LLM. Test d'abord (rouge→vert→refactor).
- **Toute sortie LLM validée par Zod** avant d'entrer dans le `core`.
- **Clean code & nommage** : `1-code-standards.md` — fonctions ≤ 30 lignes, fichiers ≤ 300, types stricts, pas de commentaires sauf contrainte non évidente. Code en anglais, UI en français.
- **Dépendances** : jamais installer un paquet sans demander ; pnpm uniquement ; `core` = zéro dépendance runtime.
- **Commits** : message court **en français** (`feat:`/`fix:`/…), **jamais de mention de Claude ni de Co-Authored-By**.
