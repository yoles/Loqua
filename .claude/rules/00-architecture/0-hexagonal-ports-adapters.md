---
description: APPLIQUER l'architecture hexagonale (ports & adapters) WHEN toucher core/ports, écrire/modifier un adapter, ou brancher une capacité technique (STT, LLM, TTS, storage…)
portée: packages/core/ports/**, packages/adapters-*/**
---

Ordre de travail (non négociable) :

- Port d'abord, adapter ensuite — jamais l'inverse
- Définir/étendre l'interface dans `core/ports` avant toute ligne d'adapter
- Enrichir un port est permis ; le contourner jamais

Contrats (ARCHITECTURE §9 = source de vérité) :

- Copier les signatures de §9 à l'identique ; tout écart = mise à jour de §9 d'abord
- Chaque port expose `capability(): RuntimeCapability` (available, qualityTier, requiresConsentToSendText)
- Aucun consommateur ne suppose une qualité : le `core` lit `qualityTier` et le restitue à l'UI
- `PronunciationScoringPort` retourne `UnscoredComparison` par défaut (Spike #2 NO-GO) ; `ScoreResult` réservé à la piste R&D supervisée

Adapters :

- Un adapter = implémentation d'un port + sa lib technique, rien d'autre
- Aucune décision métier dans un adapter (retry métier, seuils, filtrage = `core`)
- `fetch` de contenu : uniquement dans un adapter cloud, derrière `egressGuard` (voir 8-privacy-egress)
- `AudioClip.data` ne franchit JAMAIS un adapter réseau — le texte seul peut sortir
- Erreurs techniques traduites en erreurs de domaine avant de remonter au `core`

Idempotence :

- Mémoïser `TranscriptionResult` sur `AudioClip.id` (hash) — jamais re-transcrire le même audio
- Idem correction : clé = hash(transcript) + variant

Frontières :

- Toute sortie LLM validée par Zod AVANT d'entrer dans le `core` ; JSON malformé géré explicitement
- Temps : `ClockPort` injecté — jamais `Date.now()` dans `core`
