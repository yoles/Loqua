'use client';

import { useWordPractice, type PlaybackRate } from './useWordPractice';
import { useEarCompare } from './useEarCompare';
import { Waveform } from './Waveform';
import type {
  PhonemizerPort,
  PronunciationScoringPort,
  SpeechSynthesisPort,
  Variant,
} from '@loqua/core';

interface WordPanelProps {
  readonly word: string;
  readonly variant: Variant;
  readonly speech: SpeechSynthesisPort | null;
  readonly phonemizer: PhonemizerPort | null;
  readonly scoring: PronunciationScoringPort;
  onPracticed(word: string): void;
  onClose(): void;
}

const RATES: readonly PlaybackRate[] = [0.5, 0.75, 1];
const MIN_LOOP_SECONDS = 1;
const MAX_LOOP_SECONDS = 10;

// Panneau mot (dumb-ish) : IPA + syllabes + lecture isolée, vitesse, boucle.
// Le flux « je bute sur un mot → je boucle dessus » (lot 5.2, PRD §5).
export function WordPanel({
  word,
  variant,
  speech,
  phonemizer,
  scoring,
  onPracticed,
  onClose,
}: WordPanelProps) {
  const practice = useWordPractice(word, variant, speech, phonemizer);
  const compare = useEarCompare(word, variant, speech, scoring, onPracticed);

  return (
    <section className="panel word-panel" aria-label={`Prononciation de ${word}`}>
      <header className="word-panel-header">
        <h3 lang="en">{word}</h3>
        <button type="button" onClick={onClose} aria-label="Fermer le panneau">
          ✕
        </button>
      </header>

      {practice.ipa !== null ? (
        <p className="ipa" aria-label="Transcription phonétique">
          /{practice.ipa}/
        </p>
      ) : null}
      {practice.syllables.length > 0 ? (
        <p className="syllables" lang="en" aria-label="Syllabes">
          {practice.syllables.join(' · ')}
        </p>
      ) : null}

      <div className="word-controls">
        <button type="button" onClick={() => void practice.play()} disabled={practice.isSpeaking}>
          🔊 Écouter
        </button>

        <span role="group" aria-label="Vitesse de lecture">
          {RATES.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={practice.rate === value}
              onClick={() => practice.setRate(value)}
            >
              {value}×
            </button>
          ))}
        </span>

        <label>
          <input type="checkbox" checked={practice.isLooping} onChange={practice.toggleLoop} />{' '}
          Boucle
        </label>
        <label>
          toutes les{' '}
          <input
            type="number"
            min={MIN_LOOP_SECONDS}
            max={MAX_LOOP_SECONDS}
            value={practice.loopSeconds}
            onChange={(event) => practice.setLoopSeconds(Number(event.target.value))}
            aria-label="Intervalle de boucle en secondes"
          />{' '}
          s
        </label>
      </div>

      <div className="ear-compare">
        <h4>Enregistre-toi et compare</h4>
        {compare.status === 'recording' ? (
          <button type="button" onClick={() => void compare.stopRecording()}>
            ■ Terminer
          </button>
        ) : (
          <button type="button" onClick={() => void compare.startRecording()}>
            🎙️ M&apos;enregistrer
          </button>
        )}

        {compare.status === 'unavailable' ? (
          <p role="alert">Référence vocale indisponible — comparaison A/B impossible ici.</p>
        ) : null}

        {compare.hasUserClip ? (
          <div className="ab-compare">
            <div>
              <button type="button" onClick={() => void compare.playReference()}>
                ▶ Référence
              </button>
              <Waveform bars={compare.referenceBars} label="référence" />
            </div>
            <div>
              <button type="button" onClick={() => void compare.playUser()}>
                ▶ Toi
              </button>
              <Waveform bars={compare.userBars} label="toi" />
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

WordPanel.displayName = 'WordPanel';
