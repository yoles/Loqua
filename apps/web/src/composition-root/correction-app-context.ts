import { createContext, useContext } from 'react';

import type { CorrectionApp } from './correction-app';

export const CorrectionAppContext = createContext<CorrectionApp | null>(null);

export function useCorrectionApp(): CorrectionApp {
  const app = useContext(CorrectionAppContext);
  if (app === null) {
    throw new Error('useCorrectionApp must be used inside CorrectionAppProvider');
  }
  return app;
}
