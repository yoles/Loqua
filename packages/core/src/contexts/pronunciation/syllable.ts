const VOWELS = new Set('aeiouy');

function isVowel(letter: string): boolean {
  return VOWELS.has(letter);
}

// Indices de début de chaque groupe de voyelles (un noyau syllabique par groupe).
function vowelGroupStarts(letters: string): number[] {
  const starts: number[] = [];
  let inVowelGroup = false;
  for (let index = 0; index < letters.length; index += 1) {
    const vowel = isVowel(letters[index] ?? '');
    if (vowel && !inVowelGroup) {
      starts.push(index);
    }
    inVowelGroup = vowel;
  }
  return starts;
}

// Un `e` final muet ne forme pas sa propre syllabe (service → ser-vice, pas
// ser-vic-e). Heuristique : `e` final précédé d'une consonne, mot de 3+ lettres.
function dropsSilentFinalE(letters: string, groupStarts: number[]): boolean {
  const last = letters.length - 1;
  return (
    letters.length >= 3 &&
    letters[last] === 'e' &&
    !isVowel(letters[last - 1] ?? '') &&
    groupStarts.length >= 2 &&
    groupStarts[groupStarts.length - 1] === last
  );
}

// Syllabation best-effort SANS dictionnaire (aide visuelle) : une syllabe par
// groupe de voyelles ; les consonnes entre deux noyaux sont coupées « VC-CV »
// (1 consonne → CV, 2+ → première au groupe précédent). L'anglais est irrégulier :
// l'IPA (eSpeak, via le PhonemizerPort) fait autorité, ceci ne fait qu'illustrer.
export function syllabify(rawWord: string): string[] {
  const letters = rawWord.toLowerCase().replace(/[^a-z]/g, '');
  if (letters.length === 0) {
    return [];
  }
  const starts = vowelGroupStarts(letters);
  const nucleiCount = dropsSilentFinalE(letters, starts) ? starts.length - 1 : starts.length;
  if (nucleiCount <= 1) {
    return [letters];
  }

  const boundaries: number[] = [];
  for (let group = 1; group < nucleiCount; group += 1) {
    const nucleus = starts[group] ?? letters.length;
    const previousNucleus = starts[group - 1] ?? 0;
    const consonantRun = nucleus - previousNucleus - 1;
    // 1 consonne : elle démarre la syllabe suivante ; 2+ : on coupe après la 1ʳᵉ.
    boundaries.push(consonantRun <= 1 ? nucleus : previousNucleus + 2);
  }

  const syllables: string[] = [];
  let start = 0;
  for (const boundary of boundaries) {
    syllables.push(letters.slice(start, boundary));
    start = boundary;
  }
  syllables.push(letters.slice(start));
  return syllables;
}
