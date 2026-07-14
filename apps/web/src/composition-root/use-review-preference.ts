import { useCallback, useRef, useState } from 'react';

import type { MutableRefObject } from 'react';

// Préférence UI « relire le transcript avant correction » (toggle). La ref est
// lue par le runner à chaque transcription (comme l'opt-in cloud) : le pipeline
// s'assemble une seule fois, la valeur courante suit sans réassemblage.
export interface ReviewPreference {
  readonly reviewBeforeCorrection: boolean;
  readonly setReviewBeforeCorrection: (enabled: boolean) => void;
  readonly reviewRef: MutableRefObject<boolean>;
}

export function useReviewPreference(): ReviewPreference {
  const reviewRef = useRef(false);
  const [reviewBeforeCorrection, setReviewState] = useState(false);

  const setReviewBeforeCorrection = useCallback((enabled: boolean) => {
    reviewRef.current = enabled;
    setReviewState(enabled);
  }, []);

  return { reviewBeforeCorrection, setReviewBeforeCorrection, reviewRef };
}
