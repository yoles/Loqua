import type { AudioClip } from '@loqua/core';

const DEFAULT_BAR_COUNT = 48;

// Réduit un clip PCM à N barres d'amplitude (pic |sample| par fenêtre) pour une
// waveform simple. Purement visuel — AUCUNE analyse ni score (Spike #2 NO-GO).
export function waveformBars(clip: AudioClip, barCount: number = DEFAULT_BAR_COUNT): number[] {
  if (clip.format !== 'pcm') {
    return [];
  }
  const samples = new Float32Array(clip.data);
  if (samples.length === 0 || barCount <= 0) {
    return [];
  }
  const windowSize = Math.max(1, Math.floor(samples.length / barCount));
  const bars: number[] = [];
  for (let index = 0; index < barCount; index += 1) {
    const start = index * windowSize;
    let peak = 0;
    for (let offset = 0; offset < windowSize && start + offset < samples.length; offset += 1) {
      const amplitude = Math.abs(samples[start + offset] ?? 0);
      if (amplitude > peak) {
        peak = amplitude;
      }
    }
    bars.push(peak);
  }
  return bars;
}
