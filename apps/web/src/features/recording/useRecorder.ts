'use client';

import { useCallback, useRef, useState } from 'react';

import { blobToAudioClip } from '@/shared/audio/clip';
import type { AudioClip } from '@loqua/core';

export type RecorderStatus = 'idle' | 'recording' | 'denied' | 'unsupported';

interface UseRecorderResult {
  readonly status: RecorderStatus;
  start(): Promise<boolean>;
  stop(): Promise<AudioClip | null>;
}

// Micro → MediaRecorder (webm). L'audio reste en mémoire locale : il ne part
// jamais dans un flux réseau (invariant #1).
export function useRecorder(): UseRecorderResult {
  const [status, setStatus] = useState<RecorderStatus>('idle');
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);

  const start = useCallback(async (): Promise<boolean> => {
    if (typeof navigator === 'undefined' || navigator.mediaDevices === undefined) {
      setStatus('unsupported');
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      recorder.start();
      recorderRef.current = recorder;
      startedAtRef.current = performance.now();
      setStatus('recording');
      return true;
    } catch {
      setStatus('denied');
      return false;
    }
  }, []);

  const stop = useCallback(async (): Promise<AudioClip | null> => {
    const recorder = recorderRef.current;
    if (recorder === null || recorder.state === 'inactive') {
      return null;
    }
    const stopped = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
    });
    recorder.stop();
    await stopped;
    recorder.stream.getTracks().forEach((track) => track.stop());
    recorderRef.current = null;
    setStatus('idle');

    const durationMs = Math.round(performance.now() - startedAtRef.current);
    const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
    if (blob.size === 0) {
      return null;
    }
    return blobToAudioClip(blob, durationMs);
  }, []);

  return { status, start, stop };
}
