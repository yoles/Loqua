---
description: APPLIQUER la gouvernance privacy WHEN toucher egressGuard, un adapter réseau, le consentement, la persistance, ou toute donnée utilisateur (audio, transcript, correction)
portée: transverse — priorité ABSOLUE sur toute autre règle
---

Invariants (ARCHITECTURE §1 — jamais violés ; conflit = s'arrêter et remonter) :

- 1. L'audio ne quitte JAMAIS l'appareil (STT, TTS, scoring locaux, toujours)
- 2. Seul du texte peut sortir, cloud-ZDR, opt-in explicite, via un point de sortie unique
- 3. Le serveur ne lit jamais de données utilisateur ; coût marginal serveur ~0
- 4. `core` = TS pur (zéro React, DOM, Node, fetch)
- 5. Fallback jamais silencieux : bascule local→cloud consentie ET visible dans l'UI
- 6. Effacement RGPD by design : donnée dérivée = copie de valeur, jamais de référence à la source

egressGuard (le point de sortie unique) :

- UNE seule fonction du `core` décide si du texte peut sortir : consentement + opt-in Option B + capacité adapter
- Aucun `fetch` de contenu hors d'un adapter cloud passé par elle
- L'audio est refusé inconditionnellement — aucune combinaison de flags ne l'autorise
- `ConsentChanged` (contexte Identity) est écouté par le point de sortie
- Tout nouveau flux réseau de contenu = extension d'`egressGuard`, jamais un contournement

Consentement :

- Consentement biométrique (audio, même local) requis AVANT la première utilisation du micro (RGPD art. 9)
- Modélisé dans Identity/`Consent` ; révocable ; la révocation prend effet immédiatement

Effacement (invariant #6) :

- `eraseAll()` supprime base + fichiers locaux (audio, cache)
- Les `Card` SRS survivent à la suppression d'une `Session` (copies de valeur)
- Schéma prêt pour sync futur : `updatedAt` + `deletedAt` (soft-delete) par enregistrement
- Chiffrement E2E futur : clé dérivée d'un secret utilisateur, jamais sur le serveur

Observabilité :

- Métriques anonymes/locales uniquement ; AUCUNE télémétrie de contenu
- Jamais de transcript/correction/audio dans un log, un rapport d'erreur ou un event analytics
