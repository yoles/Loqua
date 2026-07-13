import { useCallback, useEffect, useState } from 'react';

import {
  attachErrorCardCreation,
  attachGamification,
  attachPronunciationCardCreation,
  createReviewDeck,
  GAMIFICATION_COLLECTION,
} from '@loqua/core';

import { openStorageForRuntime, systemClock } from './adapters';
import { SESSIONS_COLLECTION } from './use-session-persistence';
import type { EventBus, GamificationState, ReviewDeck, StoragePort } from '@loqua/core';
import type { SessionRecord } from '@/entities/session/record';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';

export interface LearningBootstrap {
  readonly storagePersistent: boolean | null;
  readonly review: ReviewDeck | null;
  readonly cardsVersion: number;
  readonly gamification: GamificationState | null;
  readonly eraseAll: () => Promise<void>;
}

interface BootstrapDeps {
  readonly bus: EventBus;
  readonly storageRef: MutableRefObject<StoragePort | null>;
  readonly setSessions: Dispatch<SetStateAction<readonly SessionRecord[]>>;
}

interface BootstrapTargets extends BootstrapDeps {
  readonly detachers: (() => void)[];
  readonly isCancelled: () => boolean;
  readonly setStoragePersistent: Dispatch<SetStateAction<boolean | null>>;
  readonly setReview: Dispatch<SetStateAction<ReviewDeck | null>>;
  readonly setCardsVersion: Dispatch<SetStateAction<number>>;
  readonly setGamification: Dispatch<SetStateAction<GamificationState | null>>;
}

function attachLearningPolicies(storage: StoragePort, targets: BootstrapTargets): void {
  const errorCards = attachErrorCardCreation(targets.bus, { storage, clock: systemClock });
  const wordCards = attachPronunciationCardCreation(targets.bus, { storage, clock: systemClock });
  const gamificationPolicy = attachGamification(targets.bus, { storage, clock: systemClock });
  targets.detachers.push(errorCards.detach, wordCards.detach, gamificationPolicy.detach);
  targets.setReview(createReviewDeck({ storage, clock: systemClock, events: targets.bus }));

  const reloadGamification = async (): Promise<void> => {
    await gamificationPolicy.settled();
    const state = await storage.read<GamificationState>(GAMIFICATION_COLLECTION, 'state');
    if (!targets.isCancelled()) {
      targets.setGamification(state);
    }
  };
  const reloadCards = async (): Promise<void> => {
    await Promise.all([errorCards.settled(), wordCards.settled()]);
    if (!targets.isCancelled()) {
      targets.setCardsVersion((version) => version + 1);
    }
  };
  targets.detachers.push(
    targets.bus.subscribe('ErrorDetected', () => void reloadCards()),
    targets.bus.subscribe('PronunciationValidated', () => void reloadCards()),
    targets.bus.subscribe('SessionCompleted', () => void reloadGamification()),
    targets.bus.subscribe('CardReviewed', () => void reloadGamification()),
  );
  void reloadGamification();
}

async function loadStoredSessions(storage: StoragePort, targets: BootstrapTargets): Promise<void> {
  const stored = await storage.query<SessionRecord>(SESSIONS_COLLECTION, {});
  if (!targets.isCancelled()) {
    targets.setSessions([...stored].sort((a, b) => b.createdAtMs - a.createdAtMs));
  }
}

async function bootstrapLearning(targets: BootstrapTargets): Promise<void> {
  try {
    const opened = await openStorageForRuntime();
    if (targets.isCancelled()) {
      opened.close();
      return;
    }
    targets.storageRef.current = opened.storage;
    targets.setStoragePersistent(opened.persistent);
    attachLearningPolicies(opened.storage, targets);
    await loadStoredSessions(opened.storage, targets);
  } catch {
    if (!targets.isCancelled()) {
      targets.setStoragePersistent(null); // indisponible — l'UI l'affiche, pas de silencieux
    }
  }
}

function startLearningBootstrap(
  deps: Omit<BootstrapTargets, 'detachers' | 'isCancelled'>,
): () => void {
  let cancelled = false;
  const detachers: (() => void)[] = [];
  void bootstrapLearning({ ...deps, detachers, isCancelled: () => cancelled });
  return () => {
    cancelled = true;
    for (const detach of detachers) {
      detach();
    }
  };
}

// Stockage : sqlite-wasm chargé hors bundler, OPFS si dispo — état TOUJOURS visible.
export function useLearningBootstrap(deps: BootstrapDeps): LearningBootstrap {
  const [storagePersistent, setStoragePersistent] = useState<boolean | null>(null);
  const [review, setReview] = useState<ReviewDeck | null>(null);
  const [cardsVersion, setCardsVersion] = useState(0);
  const [gamification, setGamification] = useState<GamificationState | null>(null);
  const { bus, storageRef, setSessions } = deps;

  useEffect(
    () =>
      startLearningBootstrap({
        bus,
        storageRef,
        setSessions,
        setStoragePersistent,
        setReview,
        setCardsVersion,
        setGamification,
      }),
    [bus, storageRef, setSessions],
  );

  const eraseAll = useCallback(async () => {
    await storageRef.current?.eraseAll();
    setSessions([]);
    setGamification(null);
    setCardsVersion((version) => version + 1);
  }, [storageRef, setSessions]);

  return { storagePersistent, review, cardsVersion, gamification, eraseAll };
}
