---
description: APPLIQUER les règles Tauri 2 WHEN travailler dans apps/desktop ou packages/adapters-tauri
portée: apps/desktop/**, packages/adapters-tauri/**
---

Principe (acquis Spike #3) :
- Même frontend React que `apps/web` — seuls les adapters injectés changent
- `packages/adapters-tauri` : fine couche TS qui appelle `invoke()` et implémente les ports du `core`
- Le `core` ignore totalement Tauri (aucun import `@tauri-apps/*` hors adapters-tauri)

Adapters :
- Un adapter Tauri = mapping port ↔ commande IPC, zéro logique métier
- Valider avec Zod ce qui revient de l'IPC avant de le retourner au `core`
- Audio échangé par chemin de fichier local, jamais par blob IPC
- Desktop = foyer du 100 % local : `CorrectionPort` par défaut = llama.cpp local (jusqu'à 14-27B)

Persistance :
- SQLite natif (SQLCipher pour le chiffrement au repos) derrière `StoragePort`
- `eraseAll()` supprime base + fichiers (audio, cache) — invariant effacement #6

Sécurité :
- Capabilities/permissions Tauri minimales : n'ouvrir que ce qui est utilisé
- Pas de `shell.open` généralisé ; scoper le filesystem aux répertoires de l'app
- Côté Rust : voir 2-rust-sidecars (validation IPC, pas de réseau dans les sidecars)
