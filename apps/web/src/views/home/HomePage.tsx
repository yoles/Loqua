'use client';

// Couche « pages » FSD (nommée views/ : un dossier src/pages activerait le
// Pages Router de Next). La page compose les widgets et features ; les widgets
// ne se composent jamais entre eux (pas d'import latéral intra-couche).
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

export function HomePage() {
  return (
    <CorrectionAppProvider>
      <HomeContent />
    </CorrectionAppProvider>
  );
}
HomePage.displayName = 'HomePage';
