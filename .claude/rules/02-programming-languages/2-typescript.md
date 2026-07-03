---
description: APPLIQUER les bonnes pratiques TypeScript strict WHEN écrire du code TS/TSX, avec les contraintes renforcées propres à packages/core
portée: "**/*.ts, **/*.tsx"
---

Types stricts :
- `strict: true` partout ; tout typer explicitement
- Jamais `any` ; `unknown` uniquement aux frontières (catch, JSON avant Zod) puis rétrécir
- Pas de cast `as` — utiliser des type guards ou Zod
- Génériques pour les fonctions réutilisables, noms de paramètres descriptifs (`TEvent`, pas `T` seul)

Interfaces & types :
- `interface` pour les objets extensibles (ports, props)
- `type` pour unions, intersections, primitives
- Unions de littéraux plutôt qu'`enum` (`type Variant = 'en-US' | 'en-GB'`)
- Unions discriminées avec champ `kind` pour les résultats (`ScoreResult | UnscoredComparison`)

Nullabilité :
- Éviter `null`/`undefined` en retour — préférer union discriminée ou résultat explicite
- Pas de `!` (non-null assertion)

Erreurs :
- `catch (error: unknown)` puis rétrécir avant usage
- Erreurs de domaine custom par bounded context

Contraintes renforcées dans `packages/core` :
- `"lib": ["ES2022"]` — zéro type DOM/Node (pas de `window`, `document`, `fetch`, `Buffer`, `process`)
- Zéro dépendance runtime dans le package.json du core
- Pas de `Date.now()` / `new Date()` → `ClockPort.now()` injecté
- Pas de `Math.random()` → source d'aléa injectée
- Immutabilité : `readonly` sur les propriétés des value objects et événements

Validation aux frontières :
- Zod pour toute donnée externe (sortie LLM, IPC Tauri, réponse HTTP, storage lu)
- Le schéma Zod vit à côté du port qu'il protège ; le type TS en est inféré (`z.infer`)
