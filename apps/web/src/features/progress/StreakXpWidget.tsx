'use client';

interface StreakXpWidgetProps {
  readonly streakDays: number;
  readonly xp: number;
}

// Composant DUMB : affichage pur du streak et de l'XP, tout vient des props.
export function StreakXpWidget({ streakDays, xp }: StreakXpWidgetProps) {
  const streakLabel =
    streakDays === 0
      ? 'Parle 1 minute aujourd’hui pour lancer ton streak'
      : `${streakDays} jour${streakDays > 1 ? 's' : ''} d’affilée`;

  return (
    <p className="status-line" aria-label="Progression">
      <span aria-label="Streak">🔥 {streakLabel}</span>
      {' · '}
      <span aria-label="Points d’expérience">✦ {xp} XP</span>
    </p>
  );
}

StreakXpWidget.displayName = 'StreakXpWidget';
