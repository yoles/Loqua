import { describe, expect, it } from 'vitest';

import { openWorkerSqliteDatabase } from './worker-sqlite.ts';
import type { SqliteWorkerLike } from './worker-sqlite.ts';

interface FakeWorkerScript {
  onRequest(message: unknown, reply: (message: unknown) => void): void;
  ready?: unknown;
}

// Faux worker en mémoire : vérifie le PROTOCOLE de l'adapter, pas sqlite.
function fakeWorker(script: FakeWorkerScript): SqliteWorkerLike & { terminated: boolean } {
  let listener: ((event: MessageEvent) => void) | null = null;
  const reply = (message: unknown): void => {
    queueMicrotask(() => listener?.({ data: message } as MessageEvent));
  };
  return {
    terminated: false,
    postMessage(message: unknown) {
      script.onRequest(message, reply);
    },
    set onmessage(handler: ((event: MessageEvent) => void) | null) {
      listener = handler;
      if (handler !== null && script.ready !== undefined) {
        reply(script.ready);
      }
    },
    terminate() {
      this.terminated = true;
    },
  };
}

function echoScript(overrides?: Partial<FakeWorkerScript>): FakeWorkerScript {
  return {
    ready: { type: 'ready', persistent: true },
    onRequest(message, reply) {
      const request = message as { id: number; op: string };
      reply({ type: 'result', id: request.id, rows: [] });
    },
    ...overrides,
  };
}

describe('worker sqlite adapter (postMessage protocol)', () => {
  it('reports persistence as announced by the worker at startup', async () => {
    const db = await openWorkerSqliteDatabase(fakeWorker(echoScript()));

    expect(db.persistent).toBe(true);
  });

  it('reports a memory fallback when the worker cannot use OPFS', async () => {
    const db = await openWorkerSqliteDatabase(
      fakeWorker(echoScript({ ready: { type: 'ready', persistent: false } })),
    );

    expect(db.persistent).toBe(false);
  });

  it('resolves queries with the rows returned by the worker', async () => {
    const rows = [{ value: '{"a":1}' }];
    const db = await openWorkerSqliteDatabase(
      fakeWorker(
        echoScript({
          onRequest(message, reply) {
            const request = message as { id: number; op: string; sql: string };
            reply({ type: 'result', id: request.id, rows: request.op === 'all' ? rows : [] });
          },
        }),
      ),
    );

    await expect(db.executor.all('SELECT 1')).resolves.toEqual(rows);
    await expect(db.executor.run('INSERT ...')).resolves.toBeUndefined();
  });

  it('correlates concurrent requests by id', async () => {
    const pending: { id: number; sql: string; reply: (m: unknown) => void }[] = [];
    const db = await openWorkerSqliteDatabase(
      fakeWorker(
        echoScript({
          onRequest(message, reply) {
            const request = message as { id: number; sql: string };
            pending.push({ id: request.id, sql: request.sql, reply });
            if (pending.length === 2) {
              // Répond dans l'ordre INVERSE — chaque promesse doit retrouver la sienne.
              for (const entry of [...pending].reverse()) {
                entry.reply({
                  type: 'result',
                  id: entry.id,
                  rows: [{ sql: entry.sql }],
                });
              }
            }
          },
        }),
      ),
    );

    const [first, second] = await Promise.all([
      db.executor.all('SELECT first'),
      db.executor.all('SELECT second'),
    ]);

    expect(first).toEqual([{ sql: 'SELECT first' }]);
    expect(second).toEqual([{ sql: 'SELECT second' }]);
  });

  it('translates a worker-reported failure into a rejected promise', async () => {
    const db = await openWorkerSqliteDatabase(
      fakeWorker(
        echoScript({
          onRequest(message, reply) {
            const request = message as { id: number };
            reply({ type: 'error', id: request.id, message: 'SQLITE_CONSTRAINT' });
          },
        }),
      ),
    );

    await expect(db.executor.run('INSERT ...')).rejects.toThrow(/SQLITE_CONSTRAINT/);
  });

  it('rejects on a malformed worker message instead of hanging or crashing', async () => {
    const db = await openWorkerSqliteDatabase(
      fakeWorker(
        echoScript({
          onRequest(message, reply) {
            const request = message as { id: number };
            reply({ garbage: true, id: request.id });
          },
        }),
      ),
    );

    await expect(db.executor.all('SELECT 1')).rejects.toThrow(/malformed/i);
  });

  it('fails fast when the worker does not become ready', async () => {
    await expect(
      openWorkerSqliteDatabase(fakeWorker(echoScript({ ready: { type: 'oops' } }))),
    ).rejects.toThrow(/ready/i);
  });

  it('terminates the worker on close', async () => {
    const worker = fakeWorker(echoScript());
    const db = await openWorkerSqliteDatabase(worker);

    db.close();

    expect(worker.terminated).toBe(true);
  });
});
