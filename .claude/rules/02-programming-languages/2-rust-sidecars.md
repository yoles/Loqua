---
description: APPLIQUER les règles des sidecars Rust WHEN écrire du Rust côté Tauri (whisper.cpp, llama.cpp, Kokoro) ou une commande IPC
portée: apps/desktop/src-tauri/**, sidecars Rust
---

Rôle :

- Un sidecar = exécution locale d'un modèle (STT/LLM/TTS), rien d'autre
- Aucun accès réseau dans un sidecar — l'inférence est locale par définition (invariant #1)
- Aucune logique métier — le sidecar reçoit une tâche, retourne un résultat brut

IPC (durcissement, ARCHITECTURE §15) :

- Valider TOUTES les entrées des commandes `invoke()` côté Rust (types, bornes, chemins)
- Sidecar : audio consommé par CHEMIN DE FICHIER local (acquis Spike #3), jamais de blob en JSON
- Ingestion webview→Rust : canal binaire BRUT vers une commande dédiée qui écrit sur disque — seule exception admise au « pas de blob IPC »
- Chemins résolus côté Rust depuis des ids validés, jamais fournis par le frontend (pas de traversal)
- Allowlist Tauri minimale : n'exposer que les commandes réellement utilisées

Erreurs :

- Pas de `unwrap()`/`expect()` sur les entrées externes — `Result` propagé et sérialisé proprement
- Erreurs typées côté Rust, mappées en erreurs de domaine côté TS (adapter)
- Logs en anglais, sans contenu utilisateur (pas de transcript dans les logs)

Modèles :

- Modèles sur le filesystem via `ModelRuntimePort` (download, checksum vérifié avant activation)
- Jamais bundler un modèle dans le binaire
