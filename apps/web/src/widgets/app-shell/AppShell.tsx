'use client';

import { CorrectionAppProvider, useCorrectionApp } from '@/composition-root';
import { StreakXpWidget } from '@/features/progress/StreakXpWidget';
import { ReviewDeckPanel } from '@/features/review/ReviewDeckPanel';
import { CorrectionSession } from '@/widgets/correction-session/CorrectionSession';

function HomeContent() {
  const app = useCorrectionApp();

  return (
    <>
      <StreakXpWidget
        streakDays={app.gamification?.streak.days ?? 0}
        xp={app.gamification?.xp ?? 0}
      />
      <CorrectionSession />
      <ReviewDeckPanel />
    </>
  );
}
HomeContent.displayName = 'HomeContent';

export function AppShell() {
  return (
    <CorrectionAppProvider>
      <HomeContent />
    </CorrectionAppProvider>
  );
}

AppShell.displayName = 'AppShell';
