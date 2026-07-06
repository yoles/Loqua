'use client';

import { useCallback, useRef, useState } from 'react';

import { pcmToAudioClip } from '@/shared/audio/clip';
import type { AudioClip } from '@loqua/core';

export type RecorderStatus = 'idle' | 'recording' | 'denied' | 'unsupported';

interface UseRecorderResult {
  readonly status: RecorderStatus;
  readonly deniedReason: string | null;
  start(): Promise<boolean>;
  stop(): Promise<AudioClip | null>;
}

const PROCESSOR_BUFFER_SIZE = 4096;

interface ActiveCapture {
  readonly context: AudioContext;
  readonly source: MediaStreamAudioSourceNode;
  readonly processor: ScriptProcessorNode;
  readonly mute: GainNode;
  readonly stream: MediaStream;
}

// ScriptProcessorNode est déprécié mais reste le seul chemin de capture PCM
// fiable sur WebKitGTK (desktop Linux) ; AudioWorklet exigerait un module servi.
// Le nœud de gain muet évite le larsen (le graphe doit atteindre destination).
function createCapture(
  stream: MediaStream,
  onSamples: (chunk: Float32Array) => void,
): ActiveCapture {
  const context = new AudioContext();
  const source = context.createMediaStreamSource(stream);
  const processor = context.createScriptProcessor(PROCESSOR_BUFFER_SIZE, 1, 1);
  const mute = context.createGain();
  mute.gain.value = 0;
  processor.onaudioprocess = (event) => {
    onSamples(new Float32Array(event.inputBuffer.getChannelData(0)));
  };
  source.connect(processor);
  processor.connect(mute);
  mute.connect(context.destination);
  return { context, source, processor, mute, stream };
}

function teardownCapture(capture: ActiveCapture): void {
  capture.processor.onaudioprocess = null;
  capture.source.disconnect();
  capture.processor.disconnect();
  capture.mute.disconnect();
  capture.stream.getTracks().forEach((track) => track.stop());
}

function mergeChunks(chunks: readonly Float32Array[]): Float32Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Float32Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

// Micro → PCM float32 via Web Audio API (pas de MediaRecorder : non supporté par
// WebKitGTK). L'audio reste en mémoire locale : il ne part jamais dans un flux
// réseau (invariant #1).
export function useRecorder(): UseRecorderResult {
  const [status, setStatus] = useState<RecorderStatus>('idle');
  const [deniedReason, setDeniedReason] = useState<string | null>(null);
  const captureRef = useRef<ActiveCapture | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);
  const startedAtRef = useRef<number>(0);

  const start = useCallback(async (): Promise<boolean> => {
    if (typeof navigator === 'undefined' || navigator.mediaDevices === undefined) {
      setStatus('unsupported');
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      captureRef.current = createCapture(stream, (chunk) => chunksRef.current.push(chunk));
      startedAtRef.current = performance.now();
      setStatus('recording');
      return true;
    } catch (error: unknown) {
      const reason =
        error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      setDeniedReason(reason);
      setStatus('denied');
      return false;
    }
  }, []);

  const stop = useCallback(async (): Promise<AudioClip | null> => {
    const capture = captureRef.current;
    if (capture === null) {
      return null;
    }
    teardownCapture(capture);
    const { sampleRate } = capture.context;
    await capture.context.close();
    captureRef.current = null;
    setStatus('idle');

    const durationMs = Math.round(performance.now() - startedAtRef.current);
    const samples = mergeChunks(chunksRef.current);
    chunksRef.current = [];
    if (samples.length === 0) {
      return null;
    }
    return pcmToAudioClip(samples, sampleRate, durationMs);
  }, []);

  return { status, deniedReason, start, stop };
}
