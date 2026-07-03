---
description: APPLIQUER le workflow de dev (méthode, régimes de test, TDD, commits) WHEN implémenter du code déterministe ou committer
portée: packages/core, adapters, services/api, git
---

Méthode :
- Trunk-Based Development

Deux régimes de test (ARCHITECTURE §16 — ne JAMAIS les mélanger) :
- Déterministe (SRS, gamification, streak, machine à états, taxonomie, egressGuard, VO) → TDD Vitest
- Sortie d'IA (qualité de correction, scoring) → eval harness UNIQUEMENT (voir 7-eval-harness-ia.md)
- Interdit : `expect(...).toBe(...)` sur une sortie de LLM
- La FORME d'une sortie LLM (schéma Zod) se teste en TDD ; sa QUALITÉ se mesure en eval

TDD (rouge → vert → refactor) :
- Écrire le test qui échoue AVANT le code de prod
- Le faire passer avec le code le plus simple ; refactorer ensuite, tests au vert
- Un comportement à la fois
- Ne jamais modifier un test pour le faire passer sans justification métier

Règles métier ambiguës (streak, egressGuard, échecs pipeline) :
- Un test explicite par cas, nommé en phrase de comportement (`describe`/`it` Vitest) — ex. « ne compte pas le streak si moins de 60 s de parole détectée »
- Pas de format Gherkin/`.feature` dédié : les tests Vitest classiques suffisent
- Un test = un comportement observable, formulé dans le langage ubiquitaire du contexte

Ordre pour une nouvelle brique :
- Port dans `core/ports` (contrat) → tests du use-case (TDD, ports factices) → use-case → adapter + test d'intégration → branchement au composition root

Commits :
- Message court, en FRANÇAIS, style `feat:` / `fix:` / `chore:` / `test:` / `docs:` / `refactor:`
- En exécution de `specs/SPRINTS.md` (run planifié) : committer à chaque lot « Done » sans redemander
- Hors exécution du plan : ne committer que si l'utilisateur le demande explicitement
- Conflit entre une tâche et un invariant (§1) → s'arrêter et remonter, ne pas contourner
