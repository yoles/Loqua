'use client';

import { useReadAloud } from './useReadAloud';
import type { SpeechSynthesisPort, Variant } from '@loqua/core';

interface ReadAloudButtonProps {
  readonly port: SpeechSynthesisPort | null;
  readonly text: string;
  readonly variant: Variant;
}

const TIER_LABEL: Record<string, string> = {
  'local-strong': 'local (WebGPU)',
  'local-basic': 'local (WASM)',
  webspeech: 'voix du navigateur',
};

// Bouton « écouter la version corrigée » (lot 5.1). Reflète le tier TTS réel et
// l'échec éventuel — pas de dégradation silencieuse (invariant #5).
export function ReadAloudButton({ port, text, variant }: ReadAloudButtonProps) {
  const { status, tier, speak } = useReadAloud(port);
  const isBusy = status === 'preparing' || status === 'speaking';
  const label =
    status === 'preparing' ? 'Préparation…' : status === 'speaking' ? '🔊 Lecture…' : '🔊 Écouter';

  return (
    <p className="read-aloud">
      <button
        type="button"
        onClick={() => void speak(text, variant)}
        disabled={isBusy || text.length === 0}
      >
        {label}
      </button>{' '}
      {tier !== null ? <span className="tier-badge">TTS : {TIER_LABEL[tier] ?? tier}</span> : null}
      {status === 'error' ? (
        <span role="alert">Lecture vocale indisponible sur cet appareil.</span>
      ) : null}
    </p>
  );
}

ReadAloudButton.displayName = 'ReadAloudButton';
