import { useCallback, useState } from 'react';

import { makeConsent } from '@loqua/core';

import { systemClock } from './adapters';
import type { EventBus } from '@loqua/core';
import type { MutableRefObject } from 'react';

export interface ConsentControls {
  readonly microphoneConsent: boolean;
  readonly cloudCorrection: boolean;
  readonly grantMicrophone: () => void;
  readonly setCloudCorrection: (enabled: boolean) => void;
}

function publishConsentEvent(
  bus: EventBus,
  microphone: boolean,
  cloudTextProcessing: boolean,
): void {
  bus.publish({
    kind: 'ConsentChanged',
    consent: makeConsent({ microphone, cloudTextProcessing, decidedAtMs: systemClock.now() }),
  });
}

// Publie ConsentChanged sur le bus (écouté par l'egressGuard) ; l'opt-in cloud
// vit dans une ref lue par le routage de correction (jamais de bascule silencieuse).
export function useConsentControls(
  bus: EventBus,
  cloudOptInRef: MutableRefObject<boolean>,
): ConsentControls {
  const [microphoneConsent, setMicrophoneConsent] = useState(false);
  const [cloudCorrection, setCloudCorrectionState] = useState(false);

  const grantMicrophone = useCallback(() => {
    setMicrophoneConsent(true);
    publishConsentEvent(bus, true, cloudOptInRef.current);
  }, [bus, cloudOptInRef]);

  const setCloudCorrection = useCallback(
    (enabled: boolean) => {
      cloudOptInRef.current = enabled;
      setCloudCorrectionState(enabled);
      publishConsentEvent(bus, true, enabled);
    },
    [bus, cloudOptInRef],
  );

  return { microphoneConsent, cloudCorrection, grantMicrophone, setCloudCorrection };
}
