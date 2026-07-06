'use client';

import { useCallback, useState } from 'react';

import { playAudioClip } from '@/shared/audio/playback';
import { isWebSpeechAvailable, speakWithWebSpeech } from './web-speech';
import type { SpeechSynthesisPort, Variant } from '@loqua/core';

export type ReadAloudStatus = 'idle' | 'preparing' | 'speaking' | 'error';

interface UseReadAloudResult {
  readonly status: ReadAloudStatus;
  readonly tier: string | null; // tier réellement utilisé ('local-*' | 'webspeech')
  speak(text: string, variant: Variant, rate?: number): Promise<void>;
}

const DEFAULT_RATE = 1;

// Orchestration read-aloud (feature, UI jetable) : TTS local d'abord (kokoro via
// le port injecté), repli WebSpeech VISIBLE si indisponible (invariant #5). Aucune
// décision métier : juste « faire sortir du son », le core n'en sait rien.
export function useReadAloud(port: SpeechSynthesisPort | null): UseReadAloudResult {
  const [status, setStatus] = useState<ReadAloudStatus>('idle');
  const [tier, setTier] = useState<string | null>(null);

  const speak = useCallback(
    async (text: string, variant: Variant, rate: number = DEFAULT_RATE): Promise<void> => {
      if (port !== null && port.capability().available) {
        setStatus('preparing');
        try {
          const clip = await port.synthesize({ text, variant, rate });
          setTier(port.capability().qualityTier);
          setStatus('speaking');
          await playAudioClip(clip);
          setStatus('idle');
          return;
        } catch {
          // TTS local en échec → repli WebSpeech (dégradation reflétée par le tier).
        }
      }
      if (isWebSpeechAvailable()) {
        setTier('webspeech');
        setStatus('speaking');
        try {
          await speakWithWebSpeech(text, { variant, rate });
          setStatus('idle');
        } catch {
          setStatus('error');
        }
        return;
      }
      setTier(null);
      setStatus('error');
    },
    [port],
  );

  return { status, tier, speak };
}
