import { describe, expect, it } from 'vitest';

import { findModel, pinnedRevision } from './registry.ts';
import type { WebModelEntry } from './registry.ts';

function requireModel(modelId: string): WebModelEntry {
  const model = findModel(modelId);
  if (model === null) {
    throw new Error(`test setup: unknown model ${modelId}`);
  }
  return model;
}

describe('web model registry', () => {
  it('extracts the pinned revision from the checksum field', () => {
    const model = requireModel('stt-whisper-base-en');

    expect(pinnedRevision(model)).toBe('main');
  });

  it('falls back to "main" when the checksum carries no revision', () => {
    const model = requireModel('stt-whisper-base-en');

    expect(pinnedRevision({ ...model, checksum: 'hf:owner/repo' })).toBe('main');
  });

  it('returns null for an unknown model id', () => {
    expect(findModel('unknown-model')).toBeNull();
  });
});
