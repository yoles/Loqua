import type { AudioClip } from '@loqua/core';

export const TARGET_SAMPLE_RATE = 16_000;

export function resampleLinear(
  input: Float32Array,
  fromRate: number,
  toRate: number,
): Float32Array {
  if (fromRate === toRate) {
    return input;
  }
  const ratio = fromRate / toRate;
  const outputLength = Math.floor(input.length / ratio);
  const output = new Float32Array(outputLength);
  for (let i = 0; i < outputLength; i += 1) {
    const position = i * ratio;
    const left = Math.floor(position);
    const right = Math.min(left + 1, input.length - 1);
    const weight = position - left;
    output[i] = (input[left] ?? 0) * (1 - weight) + (input[right] ?? 0) * weight;
  }
  return output;
}

// Décode un AudioClip vers du PCM float32 mono 16 kHz (l'entrée de Whisper).
// - 'pcm' : décodage pur (testé en Node) ;
// - 'wav'/'webm' : décodage navigateur via OfflineAudioContext (vérifié en app).
export async function decodeToPcm16k(clip: AudioClip): Promise<Float32Array> {
  if (clip.format === 'pcm') {
    return resampleLinear(new Float32Array(clip.data), clip.sampleRate, TARGET_SAMPLE_RATE);
  }

  const sampleCount = Math.ceil((clip.durationMs / 1000) * TARGET_SAMPLE_RATE);
  const context = new OfflineAudioContext(1, Math.max(sampleCount, 1), TARGET_SAMPLE_RATE);
  let buffer: AudioBuffer;
  try {
    buffer = await context.decodeAudioData(clip.data.slice(0));
  } catch (error: unknown) {
    // Capture vide/corrompue (micro muet, périphérique fantôme) : marqueur stable,
    // même clip = même échec — le retry est inutile, l'UI doit le savoir.
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`audio-decode-failed: ${detail}`);
  }
  const mono = buffer.getChannelData(0);
  return resampleLinear(mono, buffer.sampleRate, TARGET_SAMPLE_RATE);
}
