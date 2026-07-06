'use client';

import { useCallback, useState } from 'react';

import { speakText } from '@/shared/audio/speak';
import type { SpeechSynthesisPort, Variant } from '@loqua/core';

export type ReadAloudStatus = 'idle' | 'preparing' | 'speaking' | 'error';

interface UseReadAloudResult {
  readonly status: ReadAloudStatus;
  readonly tier: string | null; // tier réellement utilisé ('local-*' | 'webspeech')
  speak(text: string, variant: Variant, rate?: number): Promise<void>;
}

const DEFAULT_RATE = 1;

// Orchestration read-aloud (feature, UI jetable) : délègue à speakText (TTS local
// puis repli WebSpeech). Aucune décision métier : juste « faire sortir du son »,
// avec le tier VISIBLE (invariant #5). Le core n'en sait rien.
export function useReadAloud(port: SpeechSynthesisPort | null): UseReadAloudResult {
  const [status, setStatus] = useState<ReadAloudStatus>('idle');
  const [tier, setTier] = useState<string | null>(null);

  const speak = useCallback(
    async (text: string, variant: Variant, rate: number = DEFAULT_RATE): Promise<void> => {
      setStatus('preparing');
      try {
        const usedTier = await speakText(text, variant, rate, port);
        if (usedTier === null) {
          setTier(null);
          setStatus('error');
          return;
        }
        setTier(usedTier);
        setStatus('idle');
      } catch {
        setStatus('error');
      }
    },
    [port],
  );

  return { status, tier, speak };
}
