'use client';

import { useCallback, useMemo, useState } from 'react';

import { useRecorder } from '@/features/recording/useRecorder';
import { playAudioClip } from '@/shared/audio/playback';
import { waveformBars } from '@/shared/audio/waveform';
import type {
  AudioClip,
  PronunciationScoringPort,
  SpeechSynthesisPort,
  Variant,
} from '@loqua/core';

export type EarCompareStatus = 'idle' | 'recording' | 'ready' | 'unavailable';

interface UseEarCompareResult {
  readonly status: EarCompareStatus;
  readonly referenceBars: readonly number[];
  readonly userBars: readonly number[];
  readonly hasUserClip: boolean;
  startRecording(): Promise<void>;
  stopRecording(): Promise<void>;
  playReference(): Promise<void>;
  playUser(): Promise<void>;
}

// Enregistre-toi & compare (lot 5.3) : référence TTS vs enregistrement, écoute
// A/B, waveforms. AUCUN score (Spike #2). Un mot comparé alimente le SRS via
// onPracticed. UI jetable : orchestration de lecture, zéro logique métier.
export function useEarCompare(
  word: string,
  variant: Variant,
  speech: SpeechSynthesisPort | null,
  scoring: PronunciationScoringPort,
  onPracticed: (word: string) => void,
): UseEarCompareResult {
  const recorder = useRecorder();
  const [status, setStatus] = useState<EarCompareStatus>('idle');
  const [referenceClip, setReferenceClip] = useState<AudioClip | null>(null);
  const [userClip, setUserClip] = useState<AudioClip | null>(null);

  const ensureReference = useCallback(async (): Promise<AudioClip | null> => {
    if (referenceClip !== null) {
      return referenceClip;
    }
    if (speech === null || !speech.capability().available) {
      return null;
    }
    try {
      const clip = await speech.synthesize({ text: word, variant, rate: 1 });
      setReferenceClip(clip);
      return clip;
    } catch {
      return null;
    }
  }, [referenceClip, speech, word, variant]);

  const startRecording = useCallback(async (): Promise<void> => {
    const granted = await recorder.start();
    if (granted) {
      setStatus('recording');
    }
  }, [recorder]);

  const stopRecording = useCallback(async (): Promise<void> => {
    const clip = await recorder.stop();
    if (clip === null) {
      setStatus('idle');
      return;
    }
    setUserClip(clip);
    const reference = await ensureReference();
    if (reference === null) {
      setStatus('unavailable'); // pas de référence TTS → A/B impossible (visible)
      return;
    }
    await scoring.score({ audio: clip, reference, targetWord: word });
    onPracticed(word); // mot pratiqué → carte SRS
    setStatus('ready');
  }, [recorder, ensureReference, scoring, word, onPracticed]);

  const playReference = useCallback(async (): Promise<void> => {
    const reference = await ensureReference();
    if (reference !== null) {
      await playAudioClip(reference);
    }
  }, [ensureReference]);

  const playUser = useCallback(async (): Promise<void> => {
    if (userClip !== null) {
      await playAudioClip(userClip);
    }
  }, [userClip]);

  const referenceBars = useMemo(
    () => (referenceClip !== null ? waveformBars(referenceClip) : []),
    [referenceClip],
  );
  const userBars = useMemo(() => (userClip !== null ? waveformBars(userClip) : []), [userClip]);

  return {
    status,
    referenceBars,
    userBars,
    hasUserClip: userClip !== null,
    startRecording,
    stopRecording,
    playReference,
    playUser,
  };
}
