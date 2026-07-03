---
description: APPLIQUER les standards de test WHEN écrire un test (core, adapter, UI)
portée: "**/*.test.ts"
---

Général :
- Test co-localisé avec le code testé (même dossier de feature/context)
- Grouper avec `describe` par comportement, pas par méthode
- Vitest partout ; le `core` se teste en Node pur, sans navigateur
- Tests écrits en anglais, pattern Arrange-Act-Assert
- Noms descriptifs = phrase de comportement observable
- Réutiliser les types de prod dans les tests (pas de types dupliqués)
- Tests indépendants (ordre indifférent) ; `beforeEach`/`afterEach` pour setup partagé
- Aucun test dépendant de l'heure réelle (`ClockPort` factice) ni du réseau (sauf eval harness, régime séparé)
- Test flaky = bug à corriger immédiatement, pas à retenter
- Asserter le comportement, pas l'implémentation ; pas d'assertion fragile (message d'erreur exact, ordre de clés JSON)
- Tester les cas limites et les chemins d'erreur, pas seulement le chemin heureux

Core (`packages/core/**/*.unit.test.ts`) :
- Une unité fonctionnelle à la fois ; les seules doublures sont des implémentations en mémoire des PORTS
- Jamais de mock de module (`vi.mock`) dans le core — l'injection suffit
- `ClockPort` factice piloté par le test (avancer le temps explicitement)
- Couverture exhaustive attendue : SRS (intervalles, ease, lapses, planification) · streak (minuit local, fuseau, 60 s détectées, cumul) · reducer du pipeline (toutes transitions, y compris invalides) · `egressGuard` (toutes combinaisons consentement × opt-in × capacité ; audio → refus inconditionnel) · événements (émission, abonnement, copies de valeur)
- Invariants d'agrégat : construction invalide = rejet explicite testé
- Immutabilité : un événement/VO reçu ne doit pas être mutable

Intégration / adapters (`**/*.integration.test.ts`) :
- Vérifier qu'un adapter honore le CONTRAT de son port, pas la lib sous-jacente
- Storage : vraie base (SQLite en mémoire/OPFS simulé) — write/read/query/delete/eraseAll via le port
- Fournisseur LLM cloud : TOUJOURS mocké ; asserter que la requête ne contient que du texte autorisé
- IPC Tauri : commandes mockées côté TS ; le contrat Rust se teste côté Rust
- Cas obligatoires : réponse malformée (JSON invalide) → erreur de domaine explicite, pas de crash · échec technique (OOM, réseau) → erreur typée que le runner du pipeline sait traiter · `capability()` cohérent avec l'environnement simulé
- Opérations longues : tester la progression (`onProgress`) ; pas de `sleep` arbitraire
- Setup/teardown propres, état remis à zéro entre tests

UI (`apps/web/**/*.test.*`, `packages/ui-web/**/*.test.*`) :
- Tester les smart components/features : orchestration, réaction aux états du pipeline
- NE PAS tester les composants purement présentationnels ; NE PAS re-tester la logique métier déjà couverte dans `core`
- Mocker uniquement les frontières : adapters (via l'injection du composition root), APIs navigateur (micro, OPFS) — injecter des ports factices plutôt que mocker des modules
- Tests basés sur les actions utilisateur ; requêter par rôle/label accessible (pas par classe CSS)
- Scénarios critiques : refus de consentement → micro inaccessible, message clair · dégradation `qualityTier` visible (invariant #5) · erreur pipeline (FAILED_STT/FAILED_LLM) → options retry/dégrader/opt-in affichées
