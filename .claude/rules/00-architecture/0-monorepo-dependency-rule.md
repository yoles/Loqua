---
description: APPLIQUER la structure monorepo et la règle de dépendance WHEN créer/déplacer un fichier ou ajouter un import entre packages
portée: tout le repo (structure, imports inter-packages)
---

Structure (ARCHITECTURE §5 — ne pas inventer d'autres emplacements) :

- `packages/core` : TS pur — contexts, pipeline, ports, events, shared
- `packages/adapters-web` : transformers.js, WebLLM, kokoro.js, sqlite-wasm+OPFS, fetch proxy
- `packages/adapters-tauri` : `invoke()` vers sidecars Rust, SQLite natif
- `packages/ui-web` : composants React DOM partagés web↔desktop (jamais avec RN)
- `apps/web` : Next.js + FSD · `apps/desktop` : Tauri (réutilise le frontend web)
- `services/api` : backend fin Hono/Cloudflare Workers
- `tooling/eval` : harness d'éval IA

Règle de dépendance (la flèche pointe TOUJOURS vers `core`) :

- `core` n'importe jamais : adapter, app, framework, API plateforme, `fetch`
- Les adapters importent uniquement `core/ports` + leur lib technique
- `ui-web` n'importe jamais un adapter
- Toute violation doit casser `dependency-cruiser` — si la règle lint manque, l'ajouter

Composition root :

- Seules les apps (`apps/web`, `apps/desktop`) instancient les adapters
- Injecter les adapters dans les use-cases du `core` (DI par paramètres)
- Le `core` ne construit jamais un adapter (pas de `new XxxAdapter()` dans `core`)

Logique métier :

- Zéro logique métier hors `core`
- Un `if` métier dans un adapter ou une app = bug d'architecture, à rapatrier dans `core`

Outillage :

- pnpm workspaces + Turborepo — jamais npm/yarn
- TS strict partout ; `core` : `"lib": ["ES2022"]`, aucune lib DOM/Node
