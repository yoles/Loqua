'use client';

import type { SessionRecord } from '@/entities/session/record';

interface SessionHistoryProps {
  readonly sessions: readonly SessionRecord[];
}

export function SessionHistory({ sessions }: SessionHistoryProps) {
  if (sessions.length === 0) {
    return null;
  }
  return (
    <section className="panel" aria-labelledby="history-title">
      <h2 id="history-title">Sessions précédentes</h2>
      <ul className="corrections">
        {sessions.map((session) => (
          <li key={session.id}>
            <p className="diff-original" lang="en">
              <s>{session.originalText}</s>
            </p>
            <p lang="en">
              {session.correctedText}{' '}
              <span className="tier-badge">
                {session.corrections.length} correction(s) · {session.qualityTier}
              </span>
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

SessionHistory.displayName = 'SessionHistory';
