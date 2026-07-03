---
description: APPLIQUER les règles Next.js (App Router) WHEN travailler dans apps/web
portée: apps/web/**
---

App Router :
- App Router uniquement (pas de pages router)
- Le routage vit dans `app/` ; le contenu des pages délègue aux couches FSD (`pages`/`widgets`/`features`)
- Inférence, micro, OPFS, SQLite-WASM = client uniquement (`'use client'`) — jamais côté serveur
- Aucun secret ni clé API dans `apps/web` — les clés vivent dans `services/api`

Frontière privacy :
- Aucune route API Next.js ne traite du contenu utilisateur — le seul backend est `services/api`
- Jamais d'audio dans un flux réseau, y compris vers `services/api` (texte seul, via `egressGuard`)
- Server components : uniquement du contenu statique/vitrine, jamais de donnée utilisateur

Spécificités techniques (acquis Spike #1) :
- Headers COOP/COEP requis pour SQLite-WASM/OPFS et WebGPU — les préserver dans la config
- Modèles téléchargés à la première utilisation via `ModelRuntimePort` (jamais dans le bundle)
- Web = « lite » : STT/TTS locaux OK, LLM par défaut = cloud-ZDR opt-in

Composition root :
- L'assemblage des adapters web se fait en un point unique de l'app (provider racine client)
- Aucun import direct d'un adapter dans une feature — tout passe par l'injection
