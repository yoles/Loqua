---
description: APPLIQUER les règles de la machine à états du pipeline WHEN toucher core/pipeline (orchestration Session : record → STT → correction → diff)
portée: packages/core/pipeline/**
---

Forme (machine maison, pas XState pour l'instant) :

- Reducer pur `(state, event) => state` — aucun I/O dedans
- Les effets (appels de ports) vivent dans un runner séparé qui interprète l'état
- États du MVP : `IDLE → RECORDING → TRANSCRIBING → TRANSCRIBED → CORRECTING → CORRECTED → READY` (+ `FAILED_STT`, `FAILED_LLM`)
- La machine s'arrête utilement à `READY` (diff affiché) — TTS/practice hors chemin MVP

Politique d'échec (explicite par transition, jamais silencieuse) :

- Chaque transition d'erreur déclare : retry N fois | dégrader vers adapter local | demander à l'utilisateur
- `FAILED_LLM` : retry, sinon dégrader local, sinon proposer opt-in cloud — dans cet ordre
- Toute bascule local→cloud passe par `egressGuard` et est visible dans l'UI

Idempotence & reprise :

- Transcription mémoïsée sur `AudioClip.id` ; correction sur hash(transcript)+variant
- Persister audio + état courant via `StoragePort` à chaque transition validée
- À la réouverture, le runner reprend à la dernière transition validée

Tests (TDD exhaustif — régime déterministe) :

- Tester toutes les transitions, y compris les invalides (événement hors état = rejet explicite)
- Reducer testé en Node pur, sans mock d'I/O (il n'en a pas)
- Runner testé avec des ports factices en mémoire
