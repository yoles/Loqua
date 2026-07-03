import type { ModelDescriptor } from '@loqua/core';

// Registre des modèles web (ARCHITECTURE §11) — aucune URL en dur dans un adapter.
// Intégrité : le téléchargement et le cache sont délégués à transformers.js
// (Cache API navigateur + HF Hub) ; `checksum` porte la révision épinglée du dépôt.
export interface WebModelEntry extends ModelDescriptor {
  readonly hubId: string; // identifiant du dépôt HF consommé par transformers.js
}

export const WEB_MODEL_REGISTRY: readonly WebModelEntry[] = [
  {
    id: 'stt-whisper-base-en',
    task: 'stt',
    sizeBytes: 172_000_000, // q8 (WASM) ; fp32 WebGPU ≈ 619 Mo (mesures Spike #1)
    checksum: 'hf:onnx-community/whisper-base.en@main',
    hubId: 'onnx-community/whisper-base.en',
  },
];

export function findModel(modelId: string): WebModelEntry | null {
  return WEB_MODEL_REGISTRY.find((entry) => entry.id === modelId) ?? null;
}

// `checksum` porte la révision épinglée sous la forme `hf:owner/repo@revision` —
// extraite ici pour être réellement transmise à `pipeline()` (transformers.js).
export function pinnedRevision(entry: WebModelEntry): string {
  const [, revision] = entry.checksum.split('@');
  return revision ?? 'main';
}
