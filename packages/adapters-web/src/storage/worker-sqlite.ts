import { z } from 'zod';

import type { SqliteExecutor, SqliteParam, SqliteRow } from './sqlite-executor.ts';

// SQLite DOIT vivre dans un Worker dédié : toutes les variantes OPFS
// (Atomics.wait, createSyncAccessHandle) sont interdites sur le thread
// principal par le navigateur. L'adapter parle au worker par messages.

export interface SqliteWorkerLike {
  postMessage(message: unknown): void;
  set onmessage(handler: ((event: MessageEvent) => void) | null);
  terminate(): void;
}

export interface OpenedWorkerSqliteDatabase {
  readonly executor: SqliteExecutor;
  // false = repli mémoire (OPFS indisponible) — le composition root DOIT le
  // rendre visible (invariant #5 : jamais de dégradation silencieuse).
  readonly persistent: boolean;
  close(): void;
}

// Frontière : tout message du worker est validé avant usage.
const readyMessageSchema = z.object({
  type: z.literal('ready'),
  persistent: z.boolean(),
});

const responseMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('result'),
    id: z.number(),
    rows: z.array(z.record(z.string(), z.unknown())),
  }),
  z.object({ type: z.literal('error'), id: z.number(), message: z.string() }),
]);

interface PendingRequest {
  resolve(rows: SqliteRow[]): void;
  reject(error: Error): void;
}

const READY_TIMEOUT_MS = 20_000;

function awaitReady(worker: SqliteWorkerLike): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('sqlite worker did not become ready'));
    }, READY_TIMEOUT_MS);
    worker.onmessage = (event) => {
      clearTimeout(timeout);
      const parsed = readyMessageSchema.safeParse(event.data);
      if (parsed.success) {
        resolve(parsed.data.persistent);
      } else {
        reject(new Error('sqlite worker sent a malformed ready message'));
      }
    };
  });
}

export async function openWorkerSqliteDatabase(
  worker: SqliteWorkerLike,
): Promise<OpenedWorkerSqliteDatabase> {
  const persistent = await awaitReady(worker);

  const pending = new Map<number, PendingRequest>();
  let nextRequestId = 1;

  worker.onmessage = (event) => {
    const parsed = responseMessageSchema.safeParse(event.data);
    if (!parsed.success) {
      const orphanId = (event.data as { id?: unknown })?.id;
      const request = typeof orphanId === 'number' ? pending.get(orphanId) : undefined;
      if (request !== undefined && typeof orphanId === 'number') {
        pending.delete(orphanId);
        request.reject(new Error('sqlite worker sent a malformed response'));
      }
      return;
    }
    const request = pending.get(parsed.data.id);
    if (request === undefined) {
      return;
    }
    pending.delete(parsed.data.id);
    if (parsed.data.type === 'error') {
      request.reject(new Error(`sqlite worker error: ${parsed.data.message}`));
    } else {
      request.resolve(parsed.data.rows);
    }
  };

  function send(op: 'run' | 'all', sql: string, params: readonly SqliteParam[]): Promise<SqliteRow[]> {
    const id = nextRequestId;
    nextRequestId += 1;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      worker.postMessage({ id, op, sql, params });
    });
  }

  return {
    executor: {
      async run(sql, params = []) {
        await send('run', sql, params);
      },
      all: (sql, params = []) => send('all', sql, params),
    },
    persistent,
    close: () => worker.terminate(),
  };
}
