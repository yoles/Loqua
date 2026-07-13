---
description: APPLIQUER la Screaming Architecture et le découpage feature-based (FSD) WHEN organiser du code UI dans apps/web, apps/desktop ou ui-web
portée: apps/web/**, apps/desktop/**, packages/ui-web/**
---

Screaming architecture :

- Les noms de dossiers crient le MÉTIER, pas la technique (`recording/`, `correction-diff/`, `review/` — pas `hooks/`, `utils/`, `services/` à la racine)
- On doit deviner que c'est une app d'apprentissage de langue en lisant l'arborescence

Couches FSD dans `apps/web` (imports uniquement vers le bas) :

- `app` → `pages` → `widgets` → `features` → `entities` → `shared`
- Une couche n'importe jamais au-dessus d'elle, ni latéralement entre slices d'une même couche
- Une feature = un dossier auto-contenu : composants, hooks, état co-localisés
- `shared` : uniquement du transverse sans métier (ui kit, lib, config)

Répartition de la logique :

- L'UI est JETABLE : aucune logique métier dans apps/ — elle appelle les use-cases du `core`
- Un `if` métier dans un composant = à rapatrier dans `core`
- L'UI affiche `qualityTier` et les états du pipeline ; elle ne les décide pas
- L'état serveur/domaine vit dans le `core` ; l'état purement visuel dans la feature

Partage web↔desktop :

- Composants réutilisés par les deux → `packages/ui-web` (React DOM)
- Jamais partagés avec React Native (le mobile réécrira son UI)
- `apps/desktop` réutilise le frontend de `apps/web` ; seuls les adapters injectés changent

Limites :

- Max 10 sous-dossiers par dossier ; si dépassé, re-découper par feature
