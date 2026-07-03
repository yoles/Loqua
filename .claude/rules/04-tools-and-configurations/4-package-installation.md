---
description: APPLIQUER les règles d'installation de paquets WHEN ajouter/mettre à jour une dépendance
portée: package.json, pnpm-workspace.yaml
---

- Ne jamais installer un nouveau paquet sans demander à l'utilisateur
- Vérifier d'abord si un paquet existant du workspace couvre le besoin
- Préférer les versions stables ; épingler les versions des libs d'inférence
- pnpm uniquement (`pnpm add --filter <package>`) — jamais npm/yarn
- Installer dans le package concerné, pas à la racine (sauf outillage transverse)
- `packages/core` : AUCUNE dépendance runtime, jamais (devDependencies de test OK)
- Toute nouvelle dépendance d'adapter reste dans son package d'adapter
- Vérifier la licence et la taille ajoutée au bundle pour `apps/web`
