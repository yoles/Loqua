'use client';

import { useState } from 'react';

interface TranscriptReviewProps {
  readonly transcript: string;
  readonly onConfirm: (editedText: string) => void;
  readonly onCancel: () => void;
}

// Relecture opt-in (ARCHITECTURE §10 `userEdit?`) : l'utilisateur corrige les
// mécoutes du STT AVANT la correction, pour ne pas « corriger » du bruit de
// transcription. L'audio ne rejoue rien ici — seul le texte est édité.
// L'état de l'input est purement visuel (co-localisé dans la feature).
export function TranscriptReview({ transcript, onConfirm, onCancel }: TranscriptReviewProps) {
  const [text, setText] = useState(transcript);
  const isEmpty = text.trim().length === 0;

  return (
    <section className="panel" aria-labelledby="review-title">
      <h2 id="review-title">Relis ta transcription</h2>
      <p className="status-line">
        La transcription automatique peut mal entendre certains mots. Corrige ce que tu as
        réellement dit avant de lancer la correction.
      </p>
      <label htmlFor="review-transcript" className="sr-only">
        Transcription à relire
      </label>
      <textarea
        id="review-transcript"
        lang="en"
        rows={4}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <p>
        <button
          type="button"
          className="primary"
          disabled={isEmpty}
          onClick={() => onConfirm(text.trim())}
        >
          Corriger
        </button>{' '}
        <button type="button" onClick={onCancel}>
          Annuler
        </button>
      </p>
    </section>
  );
}

TranscriptReview.displayName = 'TranscriptReview';
