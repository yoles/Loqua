interface WaveformProps {
  readonly bars: readonly number[];
  readonly label: string;
}

const MIN_BAR_HEIGHT_PERCENT = 3;

// Waveform simple (dumb) : barres d'amplitude, purement visuel (Spike #2 : pas
// de score). Retourne null si aucune donnée.
export function Waveform({ bars, label }: WaveformProps) {
  if (bars.length === 0) {
    return null;
  }
  return (
    <div className="waveform" role="img" aria-label={`Forme d'onde ${label}`}>
      {bars.map((amplitude, index) => (
        <span
          // eslint-disable-next-line react/no-array-index-key
          key={index}
          className="waveform-bar"
          style={{ height: `${Math.max(MIN_BAR_HEIGHT_PERCENT, Math.round(amplitude * 100))}%` }}
        />
      ))}
    </div>
  );
}

Waveform.displayName = 'Waveform';
