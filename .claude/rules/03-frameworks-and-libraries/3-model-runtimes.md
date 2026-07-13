---
description: APPLIQUER les règles de runtime des modèles IA WHEN écrire un adapter d'inférence (transformers.js, WebLLM, kokoro.js, whisper.cpp, llama.cpp) ou toucher ModelRuntimePort
portée: packages/adapters-web/**, packages/adapters-tauri/**, inférence locale
---

Distribution (ARCHITECTURE §11) :

- Ne JAMAIS bundler un modèle dans le binaire ou le bundle web
- Téléchargement à la première utilisation depuis CDN, via `ModelRuntimePort` avec `onProgress`
- Cache : OPFS (web) / filesystem (desktop) ; éviction possible (`evict`)
- Vérifier le checksum avant activation d'un modèle
- Download progressif : modèle mini d'abord (app utilisable vite), upgrade en fond

Registre :

- Tout modèle est déclaré dans le `ModelRegistry` (id, task, sizeBytes, checksum, url)
- Pas d'URL de modèle en dur dans un adapter

Adapters web (acquis Spike #1) :

- WebGPU si disponible, fallback WASM — détection via `capability()`, jamais de crash
- WebGPU navigateur non fiable sous Linux/NVIDIA : le fallback WASM n'est pas un cas rare
- LLM navigateur (WebLLM) non fiable → défaut web = cloud-ZDR opt-in

Échecs & privacy :

- Échec local (OOM, WebGPU absent) → la bascule cloud passe par `egressGuard`
- Sans consentement : refus + message UI, pas de bascule silencieuse (invariant #5)
- `capability()` reflète l'état réel ici-et-maintenant (pas d'optimisme)

Qualité :

- Tout changement de modèle local ou de prompt passe l'eval harness AVANT merge (voir 7-eval-harness-ia)
