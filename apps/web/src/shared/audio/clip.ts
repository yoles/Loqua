import type { AudioClip } from '@loqua/core';

// Échantillons PCM float32 mono (Web Audio) → AudioClip. Pas de MediaRecorder :
// WebKitGTK (desktop Linux) ne le supporte pas, et le pipeline consomme du PCM
// (decodeToPcm16k). id = SHA-256 du contenu (mémoïsation/idempotence §10).
export async function pcmToAudioClip(
  samples: Float32Array,
  sampleRate: number,
  durationMs: number,
): Promise<AudioClip> {
  const data = new ArrayBuffer(samples.byteLength);
  new Float32Array(data).set(samples);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const id = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);
  return {
    id,
    format: 'pcm',
    sampleRate,
    data,
    durationMs,
  };
}
