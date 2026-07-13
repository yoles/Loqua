# INDEX des règles — Loqua

> **Protocole (obligatoire) :** avant de coder, identifier la tâche ci-dessous et lire **uniquement** les fichiers de règles listés pour cette tâche. Ne pas charger tout le dossier. Les règles « toujours applicables » sont résumées dans `CLAUDE.md` à la racine.
> Source de vérité technique : `specs/ARCHITECTURE.md` (les règles la déclinent, elle prime en cas de doute). Plan d'exécution : `specs/SPRINTS.md`.

## Toujours applicables (déjà dans CLAUDE.md, détail ici)

| Règle                                   | Fichier                                        |
| --------------------------------------- | ---------------------------------------------- |
| Clean code & nommage                    | `01-standards/1-code-standards.md`             |
| Privacy & invariants (priorité absolue) | `08-domain-specific-rules/8-privacy-egress.md` |

## Par tâche

| Si la tâche touche…                                                                                              | Lire                                                                                                                                 |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Structure du repo, création de package/fichier, imports inter-packages                                           | `00-architecture/0-monorepo-dependency-rule.md`                                                                                      |
| `core/contexts`, `core/shared`, `core/events` (domaine, VO, agrégats, événements)                                | `00-architecture/0-ddd-bounded-contexts.md` + `02-programming-languages/2-typescript.md` + `07-quality-assurance/7-tests.md`         |
| `core/ports` ou n'importe quel adapter                                                                           | `00-architecture/0-hexagonal-ports-adapters.md` + `07-quality-assurance/7-tests.md`                                                  |
| `core/pipeline` (machine à états, runner)                                                                        | `00-architecture/0-pipeline-state-machine.md` + `00-architecture/0-hexagonal-ports-adapters.md`                                      |
| Adapter d'inférence (STT/LLM/TTS, transformers.js, WebLLM, kokoro, whisper.cpp, llama.cpp) ou `ModelRuntimePort` | `03-frameworks-and-libraries/3-model-runtimes.md` + `00-architecture/0-hexagonal-ports-adapters.md`                                  |
| `apps/web` (pages, features, UI)                                                                                 | `00-architecture/0-frontend-fsd-screaming.md` + `03-frameworks-and-libraries/3-react.md` + `03-frameworks-and-libraries/3-nextjs.md` |
| `packages/ui-web` (composants partagés)                                                                          | `03-frameworks-and-libraries/3-react.md` + `00-architecture/0-frontend-fsd-screaming.md`                                             |
| `apps/desktop` ou `packages/adapters-tauri`                                                                      | `03-frameworks-and-libraries/3-tauri.md` (+ `2-rust-sidecars.md` si Rust)                                                            |
| Code Rust / sidecars / commandes IPC                                                                             | `02-programming-languages/2-rust-sidecars.md`                                                                                        |
| `services/api` (Hono, proxy ZDR, auth, entitlement)                                                              | `03-frameworks-and-libraries/3-hono-cloudflare-workers.md` + `08-domain-specific-rules/8-privacy-egress.md`                          |
| `egressGuard`, consentement, effacement, télémétrie, tout flux réseau de contenu                                 | `08-domain-specific-rules/8-privacy-egress.md`                                                                                       |
| Prompt LLM, changement de modèle, `tooling/eval`                                                                 | `07-quality-assurance/7-eval-harness-ia.md`                                                                                          |
| Écrire des tests (quel qu'en soit le type)                                                                       | `07-quality-assurance/7-tests.md` (+ `7-eval-harness-ia.md` si sortie IA)                                                            |
| Démarrer une feature (avant le code)                                                                             | `05-workflows-and-processes/5-workflow.md`                                                                                           |
| Streak, XP, SRS (règles métier à ambiguïté)                                                                      | `00-architecture/0-ddd-bounded-contexts.md` + `05-workflows-and-processes/5-workflow.md`                                             |
| Ajouter/mettre à jour une dépendance                                                                             | `04-tools-and-configurations/4-package-installation.md`                                                                              |
| Committer                                                                                                        | `05-workflows-and-processes/5-workflow.md`                                                                                           |
| Investiguer un bug signalé                                                                                       | `05-workflows-and-processes/5-bug-finder.md`                                                                                         |
| Créer/modifier une règle de ce dossier                                                                           | `meta-generator.md`                                                                                                                  |
