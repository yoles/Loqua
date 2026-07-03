import { localDayOf } from './local-day.ts';
import { applySpeech, freshDailyProgress } from './streak-rule.ts';
import { makeStreak } from './streak.ts';
import { addXp, makeXp, xpForCardReview, xpForSession } from './xp.ts';
import type { DailyProgress } from './streak-rule.ts';
import type { Streak } from './streak.ts';
import type { Xp } from './xp.ts';
import type { EventBus, Unsubscribe } from '../../events/event-bus.ts';
import type { ClockPort } from '../../ports/clock-port.ts';
import type { StoragePort } from '../../ports/storage-port.ts';

export const GAMIFICATION_COLLECTION = 'gamification';
const STATE_ID = 'state';

export interface GamificationState {
  readonly streak: Streak;
  readonly progress: DailyProgress;
  readonly xp: Xp;
}

export interface GamificationPolicyDeps {
  readonly storage: StoragePort;
  readonly clock: ClockPort;
}

export interface GamificationPolicy {
  detach(): void;
  settled(): Promise<void>;
}

function initialState(day: string): GamificationState {
  return {
    streak: makeStreak({ days: 0, lastEarnedDay: null }),
    progress: freshDailyProgress(day),
    xp: makeXp(0),
  };
}

// Le storage lu est une frontière : reconstruire via les VO (validation).
function rehydrate(raw: GamificationState): GamificationState {
  return {
    streak: makeStreak(raw.streak),
    progress: { day: raw.progress.day, spokenMs: raw.progress.spokenMs },
    xp: makeXp(raw.xp),
  };
}

export function attachGamification(
  bus: EventBus,
  deps: GamificationPolicyDeps,
): GamificationPolicy {
  let queue: Promise<void> = Promise.resolve();

  async function withState(
    mutate: (state: GamificationState, day: string) => GamificationState,
  ): Promise<void> {
    const day = localDayOf(deps.clock.now(), deps.clock.timezone());
    const raw = await deps.storage.read<GamificationState>(GAMIFICATION_COLLECTION, STATE_ID);
    const state = raw === null ? initialState(day) : rehydrate(raw);
    await deps.storage.put(GAMIFICATION_COLLECTION, STATE_ID, mutate(state, day));
  }

  const unsubscribes: Unsubscribe[] = [
    bus.subscribe('SessionCompleted', (event) => {
      queue = queue.then(() =>
        withState((state, day) => {
          const outcome = applySpeech({
            progress: state.progress,
            streak: state.streak,
            spokenMs: event.spokenMs,
            day,
          });
          return { ...outcome, xp: addXp(state.xp, xpForSession()) };
        }),
      );
    }),
    bus.subscribe('CardReviewed', () => {
      queue = queue.then(() =>
        withState((state) => ({ ...state, xp: addXp(state.xp, xpForCardReview()) })),
      );
    }),
  ];

  return {
    detach: () => {
      for (const unsubscribe of unsubscribes) {
        unsubscribe();
      }
    },
    settled: () => queue,
  };
}
