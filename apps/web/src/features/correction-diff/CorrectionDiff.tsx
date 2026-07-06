'use client';

import { useState } from 'react';

import type { Correction } from '@loqua/core';

interface CorrectionDiffProps {
  readonly originalText: string;
  readonly correctedText: string;
  readonly corrections: readonly Correction[];
  readonly onWordSelect?: (word: string) => void; // tap-sur-mot (lot 5.2)
}

// Retire la ponctuation encadrante ; conserve lettres et apostrophes internes.
function cleanWord(token: string): string {
  return token.replace(/^[^A-Za-z']+|[^A-Za-z']+$/g, '');
}

// Rend chaque mot cliquable (ouvre le panneau prononciation), en conservant le
// surlignage des fragments corrigés.
function clickableWords(
  text: string,
  fixedFragments: readonly string[],
  onWordSelect: (word: string) => void,
) {
  const fixedWords = new Set(
    fixedFragments.flatMap((fragment) => fragment.toLowerCase().split(/\s+/)),
  );
  return text.split(/(\s+)/).map((token, index) => {
    const word = cleanWord(token);
    if (word.length === 0) {
      return token;
    }
    const isFixed = fixedWords.has(word.toLowerCase());
    return (
      <button
        // eslint-disable-next-line react/no-array-index-key
        key={index}
        type="button"
        className={isFixed ? 'word-chip fixed' : 'word-chip'}
        onClick={() => onWordSelect(word)}
      >
        {token}
      </button>
    );
  });
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
export function CorrectionDiff({
  originalText,
  correctedText,
  corrections,
  onWordSelect,
}: CorrectionDiffProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const fixedFragments = corrections.map((correction) => correction.fixed);

  return (
    <section className="panel" aria-labelledby="diff-title">
      <h2 id="diff-title">Ta version corrigée</h2>
      <p className="diff-original">
        <s>{originalText}</s>
      </p>
      <p className="diff-corrected" lang="en">
        {onWordSelect !== undefined
          ? clickableWords(correctedText, fixedFragments, onWordSelect)
          : highlight(correctedText, fixedFragments)}
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
