'use client';

import { useCallback } from 'react';

import { useCorrectionApp } from '@/composition-root';
import { ConsentGate } from '@/features/consent/ConsentGate';
import { CorrectionDiff } from '@/features/correction-diff/CorrectionDiff';
import { SessionHistory } from '@/features/history/SessionHistory';
import { StorageControls } from '@/features/settings/StorageControls';
import { useRecorder } from '@/features/recording/useRecorder';
import { sessionView } from '@/entities/session/view-model';

// Widget SMART : orchestre micro → runner → diff. La logique métier vit dans le
// core ; ici on reflète l'état du pipeline et on relaie les intentions utilisateur.
export function CorrectionSession() {
  const appCtx = useCorrectionApp();
  const recorder = useRecorder();
  const view = sessionView(appCtx.state);

  const onRecordClick = useCallback(async () => {
    if (view.isRecording) {
      const clip = await recorder.stop();
      if (clip !== null) {
        await appCtx.runner.finishRecording(clip);
      } else {
        appCtx.runner.abort();
      }
      return;
    }
    const granted = await recorder.start();
    if (granted) {
      appCtx.runner.startRecording();
    }
  }, [appCtx.runner, recorder, view.isRecording]);

  const egressRefused = view.failure?.cause === 'egress-refused';
  const undecodableAudio = view.failure?.cause === 'undecodable-audio';
  const readyCorrections =
    appCtx.state.phase === 'READY' ? appCtx.state.correction.corrections : [];
  const correctionTier =
    appCtx.state.phase === 'READY' ? appCtx.state.correction.qualityTier : null;

  return (
    <ConsentGate
      microphoneConsent={appCtx.microphoneConsent}
      onGrantMicrophone={appCtx.grantMicrophone}
    >
      <section aria-label="Enregistrement">
        <p>
          <span className="tier-badge">STT : {appCtx.sttTier} (local)</span>{' '}
          {correctionTier !== null ? (
            <span className="tier-badge">correction : {correctionTier}</span>
          ) : null}
        </p>

        <label style={{ display: 'block', marginBlock: '0.75rem' }}>
          <input
            type="checkbox"
            checked={appCtx.cloudCorrection}
            onChange={(event) => appCtx.setCloudCorrection(event.target.checked)}
          />{' '}
          Correction avancée (cloud sans rétention — <strong>texte seul</strong>, jamais
          l&apos;audio)
        </label>

        <button
          type="button"
          className={view.isRecording ? 'recording' : 'primary'}
          disabled={!view.canStartRecording && !view.isRecording}
          onClick={onRecordClick}
        >
          {view.isRecording ? '■ Terminer et corriger' : '● Parler en anglais'}
        </button>

        {recorder.status === 'denied' ? (
          <p className="status-line" role="alert">
            Accès micro refusé par le navigateur — vérifie les permissions du site.
          </p>
        ) : null}

        <p className="status-line" role="status">
          {view.busyLabel ?? ''}
        </p>

        {appCtx.downloadProgress !== null ? (
          <p className="status-line">
            Téléchargement du modèle local (première utilisation)…{' '}
            {Math.round(appCtx.downloadProgress * 100)}%
            <progress value={appCtx.downloadProgress} max={1} />
          </p>
        ) : null}
      </section>

      {view.failure !== null ? (
        <section className="panel error-panel" role="alert">
          <h2>{view.failure.kind === 'stt' ? 'Transcription impossible' : 'Correction impossible'}</h2>
          <p className="status-line">{view.failure.reason}</p>
          {egressRefused ? (
            <p>
              La correction avancée est désactivée : active « Correction avancée » ci-dessus
              (seul le <strong>texte</strong> transcrit est envoyé, jamais ta voix), puis
              réessaie.
            </p>
          ) : null}
          {undecodableAudio ? (
            <p>
              Le micro n&apos;a rien capté d&apos;exploitable (périphérique muet ou
              déconnecté&nbsp;?). Vérifie ton micro puis ré-enregistre — réessayer sur cet
              enregistrement échouerait à l&apos;identique.
            </p>
          ) : null}
          <p>
            {view.failure.canRetry ? (
              <>
                <button
                  type="button"
                  className="primary"
                  onClick={() => void appCtx.runner.retry()}
                >
                  Réessayer
                </button>{' '}
              </>
            ) : null}
            <button
              type="button"
              className={view.failure.canRetry ? undefined : 'primary'}
              onClick={() => appCtx.runner.abort()}
            >
              {view.failure.canRetry ? 'Abandonner' : 'Ré-enregistrer'}
            </button>
          </p>
        </section>
      ) : null}

      {view.diff !== null ? (
        <CorrectionDiff
          originalText={view.diff.originalText}
          correctedText={view.diff.correctedText}
          corrections={readyCorrections}
        />
      ) : null}

      <SessionHistory sessions={appCtx.sessions} />
      <StorageControls
        persistent={appCtx.storagePersistent}
        onEraseAll={() => void appCtx.eraseAll()}
      />
    </ConsentGate>
  );
}

CorrectionSession.displayName = 'CorrectionSession';
