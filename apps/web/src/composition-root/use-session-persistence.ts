import { useCallback, useRef, useState } from 'react';

import { systemClock } from './adapters';
import type { ReadySession, StoragePort } from '@loqua/core';
import type { SessionRecord } from '@/entities/session/record';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';

export const SESSIONS_COLLECTION = 'sessions';

export interface SessionPersistence {
  readonly sessions: readonly SessionRecord[];
  readonly setSessions: Dispatch<SetStateAction<readonly SessionRecord[]>>;
  readonly storageRef: MutableRefObject<StoragePort | null>;
  readonly persistSession: (session: ReadySession) => void;
}

function sessionRecordOf(session: ReadySession, nowMs: number): SessionRecord {
  return {
    id: `${session.clipId}-${nowMs}`,
    createdAtMs: nowMs,
    variant: session.state.correction.variant,
    originalText: session.transcription.text,
    correctedText: session.correction.correctedText,
    corrections: session.state.correction.corrections,
    qualityTier: session.state.correction.qualityTier,
  };
}

export function useSessionPersistence(): SessionPersistence {
  const [sessions, setSessions] = useState<readonly SessionRecord[]>([]);
  const storageRef = useRef<StoragePort | null>(null);

  const persistSession = useCallback((session: ReadySession) => {
    const record = sessionRecordOf(session, systemClock.now());
    setSessions((current) => [record, ...current]);
    void storageRef.current?.put(SESSIONS_COLLECTION, record.id, record);
  }, []);

  return { sessions, setSessions, storageRef, persistSession };
}
