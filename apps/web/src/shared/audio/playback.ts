import type { AudioClip } from '@loqua/core';

// Joue un AudioClip PCM local via Web Audio ; résout à la fin de la lecture.
// Lecture 100 % locale : l'audio ne quitte jamais l'appareil (invariant #1).
export async function playAudioClip(clip: AudioClip): Promise<void> {
  if (clip.format !== 'pcm') {
    throw new Error(`playAudioClip supports PCM clips only, got ${clip.format}`);
  }
  const context = new AudioContext();
  try {
    const samples = new Float32Array(clip.data);
    const buffer = context.createBuffer(1, samples.length, clip.sampleRate);
    buffer.copyToChannel(samples, 0);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    await new Promise<void>((resolve) => {
      source.onended = () => resolve();
      source.start();
    });
  } finally {
    await context.close();
  }
}
