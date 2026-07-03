'use client';

import { useCallback, useEffect, useState } from 'react';

import { REVIEW_GRADES, type Card, type ReviewGrade } from '@loqua/core';

import { useCorrectionApp } from '@/composition-root';
import { GRADE_LABELS, reviewDeckView } from '@/entities/review/view-model';

// Feature SMART : deck du jour. La planification vit dans le core (ReviewDeck) ;
// ici on affiche la carte courante et on relaie le grade choisi.
export function ReviewDeckPanel() {
  const app = useCorrectionApp();
  const [due, setDue] = useState<readonly Card[] | null>(null);
  const [answerShown, setAnswerShown] = useState(false);

  useEffect(() => {
    if (app.review === null) {
      return;
    }
    let cancelled = false;
    void app.review.dueCards().then((cards) => {
      if (!cancelled) {
        setDue(cards);
        setAnswerShown(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [app.review, app.cardsVersion]);

  const onGrade = useCallback(
    async (grade: ReviewGrade) => {
      const current = due?.[0];
      if (app.review === null || current === undefined) {
        return;
      }
      await app.review.review(current, grade);
      setDue((cards) => (cards ?? []).slice(1));
      setAnswerShown(false);
    },
    [app.review, due],
  );

  const view = reviewDeckView(due);
  if (app.review === null || view.isLoading) {
    return null;
  }

  return (
    <section className="panel" aria-label="Révision du jour">
      <h2>Révision du jour</h2>
      {view.isDone ? (
        <p className="status-line">Rien à revoir aujourd&apos;hui — reviens demain.</p>
      ) : null}
      {view.current !== null ? (
        <>
          <p className="status-line">
            {view.remaining} carte{view.remaining > 1 ? 's' : ''} à revoir
          </p>
          <p lang="en">
            <strong>{view.current.prompt}</strong>
          </p>
          {answerShown ? (
            <>
              <p lang="en" aria-label="Version corrigée">
                → <strong>{view.current.answer}</strong>
              </p>
              {view.current.categoryLabel !== null ? (
                <p className="status-line">Catégorie : {view.current.categoryLabel}</p>
              ) : null}
              <p role="group" aria-label="Évaluer la carte">
                {REVIEW_GRADES.map((grade) => (
                  <button key={grade} type="button" onClick={() => void onGrade(grade)}>
                    {GRADE_LABELS[grade]}
                  </button>
                ))}
              </p>
            </>
          ) : (
            <button type="button" className="primary" onClick={() => setAnswerShown(true)}>
              Voir la correction
            </button>
          )}
        </>
      ) : null}
    </section>
  );
}

ReviewDeckPanel.displayName = 'ReviewDeckPanel';
