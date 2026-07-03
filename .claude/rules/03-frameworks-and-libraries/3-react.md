---
description: APPLIQUER les standards React WHEN écrire un composant dans apps/web, apps/desktop ou ui-web
portée: apps/web/**/*.tsx, packages/ui-web/**/*.tsx
---

Structure :
- Composants fonctionnels uniquement, légers et petits
- Props strictement typées (interface dédiée)
- Un composant par fichier (sauf minuscule sous-composant privé à usage unique)
- Pas d'export default ; `displayName` en bas de fichier
- Retourner `null` si les props obligatoires manquent

Séparation smart/dumb :
- Smart : branché aux use-cases du `core` (via le composition root), porte l'état et la logique d'orchestration UI
- Dumb : affichage pur, reçoit tout par props typées, ne connaît ni le `core` ni les adapters
- Variables calculées déclarées en haut du composant dumb
- Sous-composants découpés par responsabilité ; partagé → remonter dans `ui-web`

État :
- Jamais de logique métier dans un composant (elle vit dans `core`)
- L'UI reflète l'état de la machine à pipeline ; elle ne décide pas des transitions métier
- État purement visuel co-localisé dans la feature (FSD, voir 0-frontend-fsd-screaming)

Style & accessibilité :
- Mobile-first
- Réutiliser les composants `ui-web` existants avant d'en créer
- HTML sémantique + attributs ARIA appropriés
- Navigation clavier garantie (la boucle record→diff doit être jouable au clavier)
- États du pipeline et `qualityTier` toujours visibles (invariant #5 : pas de fallback silencieux)
