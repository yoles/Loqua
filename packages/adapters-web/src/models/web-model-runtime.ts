import { WEB_MODEL_REGISTRY, findModel } from './registry.ts';
import type { ModelDescriptor, ModelRuntimePort } from '@loqua/core';

const TRANSFORMERS_CACHE = 'transformers-cache';

export type ModelLoader = (onProgress: (ratio: number) => void) => Promise<void>;

// ModelRuntimePort web : le téléchargement/cache réel est délégué aux loaders
// (transformers.js met en Cache API à la construction du pipeline).
export function createWebModelRuntime(
  loaders: Readonly<Record<string, ModelLoader>>,
): ModelRuntimePort {
  return {
    list(): ModelDescriptor[] {
      return WEB_MODEL_REGISTRY.map(({ hubId: _hubId, ...descriptor }) => descriptor);
    },

    async isReady(modelId: string): Promise<boolean> {
      const model = findModel(modelId);
      if (model === null || typeof caches === 'undefined') {
        return false;
      }
      const cache = await caches.open(TRANSFORMERS_CACHE);
      const keys = await cache.keys();
      return keys.some((request) => request.url.includes(model.hubId));
    },

    async download(modelId: string, onProgress: (ratio: number) => void): Promise<void> {
      const loader = loaders[modelId];
      if (loader === undefined) {
        throw new Error(`no loader registered for model ${modelId}`);
      }
      await loader(onProgress);
      onProgress(1);
    },

    async evict(modelId: string): Promise<void> {
      const model = findModel(modelId);
      if (model === null || typeof caches === 'undefined') {
        return;
      }
      const cache = await caches.open(TRANSFORMERS_CACHE);
      const keys = await cache.keys();
      await Promise.all(
        keys
          .filter((request) => request.url.includes(model.hubId))
          .map((request) => cache.delete(request)),
      );
    },
  };
}
