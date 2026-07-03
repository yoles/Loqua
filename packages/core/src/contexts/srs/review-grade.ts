// Barème de révision (SM-2/FSRS) — consommé par l'algo SRS (Sprint 3) et l'event CardReviewed.
export const REVIEW_GRADES = ['again', 'hard', 'good', 'easy'] as const;

export type ReviewGrade = (typeof REVIEW_GRADES)[number];
