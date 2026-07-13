'use client';

import type { ReactNode } from 'react';

interface ConsentGateProps {
  readonly microphoneConsent: boolean;
  readonly onGrantMicrophone: () => void;
  readonly children: ReactNode;
}

// Consentement biométrique (RGPD art. 9) AVANT la première utilisation du micro —
// même si l'audio reste local, on l'explique et on demande explicitement.
export function ConsentGate({ microphoneConsent, onGrantMicrophone, children }: ConsentGateProps) {
  if (microphoneConsent) {
    return <>{children}</>;
  }
  return (
    <section className="panel" aria-labelledby="consent-title">
      <h2 id="consent-title">Ton micro, tes données</h2>
      <p>
        Loqua enregistre ta voix <strong>uniquement sur cette machine</strong> pour la transcrire
        localement. L&apos;audio ne quitte jamais ton appareil ; aucun son n&apos;est envoyé sur le
        réseau.
      </p>
      <button type="button" className="primary" onClick={onGrantMicrophone}>
        J&apos;autorise l&apos;utilisation du micro (traitement 100&nbsp;% local)
      </button>
    </section>
  );
}

ConsentGate.displayName = 'ConsentGate';
