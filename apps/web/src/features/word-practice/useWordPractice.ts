'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { syllabify } from '@loqua/core';
import { speakText } from '@/shared/audio/speak';
import type { PhonemizerPort, SpeechSynthesisPort, Variant } from '@loqua/core';

export type PlaybackRate = 0.5 | 0.75 | 1;

const DEFAULT_LOOP_SECONDS = 3;

interface UseWordPracticeResult {
  readonly ipa: string | null;
  readonly syllables: readonly string[];
  readonly rate: PlaybackRate;
  readonly isLooping: boolean;
  readonly loopSeconds: number;
  readonly isSpeaking: boolean;
  setRate(rate: PlaybackRate): void;
  setLoopSeconds(seconds: number): void;
  play(): Promise<void>;
  toggleLoop(): void;
}

// Pratique d'un mot (lot 5.2) : IPA (port phonemizer), syllabes (core), lecture
// isolée (TTS local → repli WebSpeech), vitesse et mode boucle. UI jetable :
// aucune logique métier, juste l'orchestration de lecture.
export function useWordPractice(
  word: string,
  variant: Variant,
  speech: SpeechSynthesisPort | null,
  phonemizer: PhonemizerPort | null,
): UseWordPracticeResult {
  const [ipa, setIpa] = useState<string | null>(null);
  const [rate, setRate] = useState<PlaybackRate>(1);
  const [isLooping, setIsLooping] = useState(false);
  const [loopSeconds, setLoopSeconds] = useState(DEFAULT_LOOP_SECONDS);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const rateRef = useRef<PlaybackRate>(rate);
  rateRef.current = rate;

  const syllables = useMemo<readonly string[]>(() => syllabify(word), [word]);

  useEffect(() => {
    let cancelled = false;
    setIpa(null);
    if (phonemizer === null || word.length === 0) {
      return;
    }
    phonemizer.toIpa({ word, variant }).then(
      (value) => {
        if (!cancelled) {
          setIpa(value);
        }
      },
      () => {
        if (!cancelled) {
          setIpa(null); // phonémisation indisponible — l'UI masque simplement l'IPA
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [word, variant, phonemizer]);

  const play = useCallback(async (): Promise<void> => {
    setIsSpeaking(true);
    try {
      await speakText(word, variant, rateRef.current, speech);
    } catch {
      // lecture indisponible sur cet appareil — dégradation gérée côté UI
    } finally {
      setIsSpeaking(false);
    }
  }, [word, variant, speech]);

  useEffect(() => {
    if (!isLooping) {
      return;
    }
    void play();
    const interval = setInterval(() => void play(), loopSeconds * 1000);
    return () => clearInterval(interval);
  }, [isLooping, loopSeconds, play]);

  const toggleLoop = useCallback(() => setIsLooping((looping) => !looping), []);

  return {
    ipa,
    syllables,
    rate,
    isLooping,
    loopSeconds,
    isSpeaking,
    setRate,
    setLoopSeconds,
    play,
    toggleLoop,
  };
}
