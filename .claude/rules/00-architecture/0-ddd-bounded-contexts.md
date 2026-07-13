---
description: APPLIQUER le DDD (bounded contexts, langage ubiquitaire, agrégats, événements) WHEN écrire du code domaine dans packages/core/contexts ou core/events
portée: packages/core/contexts/**, packages/core/events/**, packages/core/shared/**
---

Bounded contexts (5, ne jamais les fusionner) :

- `correction` : Utterance, Variant, CorrectionLevel, Correction, ErrorType, Explanation — agrégat racine `Session`
- `pronunciation` : Word, Phoneme, IPA, Syllable, PracticeAttempt, ScoreResult | UnscoredComparison — agrégat racine `PracticeAttempt`
- `srs` : Card, ReviewItem, Ease, Interval, NextReview, Lapse, ReviewGrade — agrégat racine `Card` — algo SM-2/FSRS déterministe, zéro I/O
- `gamification` : XP, Streak, Level, Rank, Badge, Challenge — piloté par événements uniquement
- `identity` : Account, Subscription, Entitlement, Consent (biométrique RGPD art. 9)

Langage ubiquitaire :

- Employer les termes du contexte, exactement (pas de synonymes maison)
- Un terme = un contexte ; ne pas importer le vocabulaire d'un contexte dans un autre

Agrégats & invariants :

- Une `Correction` n'existe que dans une `Session`
- Une `Card` SRS stocke une COPIE DE VALEUR de l'item — jamais une référence vers la `Session` (invariant effacement #6)
- Value objects immuables (readonly, pas de setter)
- Pas de modèle anémique : le comportement vit avec la donnée

Communication inter-contextes (uniquement par événements) :

- Bus in-process `core/events` : synchrone, typé, testable
- Un contexte ne lit jamais directement les entités d'un autre contexte
- Un événement transporte des copies de valeur immuables, jamais des entités mutables
- Événements canoniques : `SessionCompleted`, `ErrorDetected {type, value}`, `PronunciationValidated {word}`, `SoundMissed {phoneme}`, `CardReviewed {grade}`, `ConsentChanged`
- Nouveau besoin de comm inter-contexte = nouvel événement, pas un import croisé
- Pas d'ACL formels pour l'instant (sur-ingénierie assumée)

Règle du Streak (test explicite par cas, voir 5-workflow.md) :

- Fuseau = fuseau local de l'appareil ; bascule à minuit local
- ≥ 60 s de parole DÉTECTÉE (pas micro ouvert) ; cumul autorisé sur la journée
