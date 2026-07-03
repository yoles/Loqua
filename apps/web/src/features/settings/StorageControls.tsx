'use client';

interface StorageControlsProps {
  readonly persistent: boolean | null; // null = stockage indisponible
  readonly onEraseAll: () => void;
}

// Réglages : état du stockage (jamais silencieux, invariant #5) + droit à
// l'effacement (invariant #6) accessible en un geste.
export function StorageControls({ persistent, onEraseAll }: StorageControlsProps) {
  return (
    <section className="panel" aria-labelledby="settings-title">
      <h2 id="settings-title">Données locales</h2>
      {persistent === null ? (
        <p className="status-line" role="alert">
          Stockage local indisponible — l&apos;historique ne sera pas conservé.
        </p>
      ) : persistent ? (
        <p className="status-line">Historique conservé sur cette machine (SQLite/OPFS).</p>
      ) : (
        <p className="status-line" role="alert">
          Persistance OPFS indisponible — historique gardé en mémoire, perdu au
          rechargement.
        </p>
      )}
      <button type="button" onClick={onEraseAll} disabled={persistent === null}>
        Tout effacer (historique et données locales)
      </button>
    </section>
  );
}

StorageControls.displayName = 'StorageControls';
