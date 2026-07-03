import type { AudioClip } from '@loqua/core';

// Blob micro → AudioClip. L'id = SHA-256 du contenu (mémoïsation/idempotence §10).
export async function blobToAudioClip(blob: Blob, durationMs: number): Promise<AudioClip> {
  const data = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', data);
  const id = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);
  return {
    id,
    format: 'webm',
    sampleRate: 48_000, // le décodage réel lit l'en-tête (decodeToPcm16k)
    data,
    durationMs,
  };
}
