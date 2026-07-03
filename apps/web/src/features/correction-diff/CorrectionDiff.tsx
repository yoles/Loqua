'use client';

import { useState } from 'react';

import type { Correction } from '@loqua/core';

interface CorrectionDiffProps {
  readonly originalText: string;
  readonly correctedText: string;
  readonly corrections: readonly Correction[];
}

function highlight(text: string, fragments: readonly string[]) {
  if (fragments.length === 0) {
    return text;
  }
  const pattern = fragments
    .map((fragment) => fragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  const parts = text.split(new RegExp(`(${pattern})`, 'gi'));
  return parts.map((part, index) =>
    fragments.some((fragment) => fragment.toLowerCase() === part.toLowerCase()) ? (
      // eslint-disable-next-line react/no-array-index-key
      <mark key={index}>{part}</mark>
    ) : (
      part
    ),
  );
}

// Vue diff cliquable (dumb) : chaque correction s'ouvre sur sa catégorie + explication.
export function CorrectionDiff({ originalText, correctedText, corrections }: CorrectionDiffProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const fixedFragments = corrections.map((correction) => correction.fixed);

  return (
    <section className="panel" aria-labelledby="diff-title">
      <h2 id="diff-title">Ta version corrigée</h2>
      <p className="diff-original">
        <s>{originalText}</s>
      </p>
      <p className="diff-corrected" lang="en">
        {highlight(correctedText, fixedFragments)}
      </p>

      {corrections.length === 0 ? (
        <p className="status-line">Rien à corriger — c&apos;était naturel. 👏</p>
      ) : (
        <ul className="corrections">
          {corrections.map((correction, index) => (
            <li key={`${correction.original}-${index}`} className="correction-item">
              <button
                type="button"
                aria-expanded={openIndex === index}
                onClick={() => setOpenIndex(openIndex === index ? null : index)}
              >
                <span className="correction-type">{correction.type}</span>
                <span lang="en">
                  <s>{correction.original}</s> → <strong>{correction.fixed}</strong>
                </span>
              </button>
              {openIndex === index ? (
                <p className="correction-explanation">{correction.explanation}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

CorrectionDiff.displayName = 'CorrectionDiff';
