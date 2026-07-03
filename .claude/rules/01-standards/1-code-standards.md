---
description: APPLIQUER les standards de code (clean code + nommage) WHEN écrire ou nommer du code (TS, Rust, config)
portée: toujours
---

Qualité :
- Code le plus simple possible ; pas d'abstraction spéculative (YAGNI)
- Pas de commentaires, exception : une contrainte non évidente qu'on ne peut pas exprimer dans le code (invariant, workaround, réf. ARCHITECTURE §)
- Types stricts partout ; aucune valeur non typée
- Constantes explicites nommées, jamais de nombres magiques
- Pas de double négation
- Noms longs et lisibles plutôt que courts et cryptiques
- Éliminer la duplication (DRY) mais pas au prix d'un couplage entre bounded contexts

Limites de taille :
- Max 30 lignes par fonction
- Max 5 paramètres par fonction (au-delà : objet d'options typé)
- Max 300 lignes par fichier
- Max 10 sous-fichiers par dossier

Responsabilités :
- Une responsabilité par fichier
- Pas de paramètre-drapeau booléen (préférer deux fonctions nommées)

Erreurs :
- Fail fast : valider tôt, jeter tôt
- Erreurs de domaine custom (par bounded context), pas de `throw new Error("oops")`
- Messages utilisateur traduits (fr) ; logs en anglais avec code d'erreur
- Jamais d'échec silencieux — en particulier toute dégradation locale→cloud (invariant #5)

Nommage — principes :
- Noms descriptifs qui révèlent l'intention
- Pas de nom à une lettre (sauf index de boucle)
- Pas d'abréviations, sauf usuelles (id, url, srs, stt, tts, llm, ipa)
- Terminologie cohérente = langage ubiquitaire du bounded context (voir 0-ddd-bounded-contexts)
- Code et identifiants en ANGLAIS ; UI et messages utilisateur en français

Casse (TypeScript) :
- `PascalCase` : classes, interfaces, types, composants React, événements de domaine
- `camelCase` : fonctions, méthodes, variables, propriétés
- `UPPER_SNAKE_CASE` : constantes, groupées par objet `as const` plutôt qu'enum
- `kebab-case` : noms de fichiers et dossiers

Fonctions :
- Verbe pour une action (`transcribeAudio`, `applyReview`)
- Nom pour un retour de valeur (`nextReviewDate`)
- Booléens préfixés `is`, `has`, `should`, `can`
- Ports : suffixe `Port` ; adapters : `<Tech><Port>Adapter` (ex. `WhisperWasmTranscriptionAdapter`)
- Événements de domaine au participe passé (`SessionCompleted`, `ErrorDetected`)

Collections :
- Pluriel pour tableaux/collections (`corrections`, `phonemes`)

Tests :
- Fichiers : `*.unit.test.ts` (unitaire), `*.integration.test.ts` (intégration)
- Noms de tests en anglais, phrase de comportement (`applies SM-2 interval after a lapse`)
