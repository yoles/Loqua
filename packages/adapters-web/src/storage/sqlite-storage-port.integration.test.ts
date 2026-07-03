import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createSqliteStoragePort } from './sqlite-storage-port.ts';
import type { SqliteExecutor, SqliteRow } from './sqlite-executor.ts';
import type { StoragePort } from '@loqua/core';

// Le contrat du port se vérifie sur une VRAIE base SQLite (node:sqlite en test,
// sqlite-wasm/OPFS en prod) — même SQL via la couture SqliteExecutor.
function nodeSqliteExecutor(db: DatabaseSync): SqliteExecutor {
  return {
    run(sql, params = []) {
      db.prepare(sql).run(...params);
    },
    all(sql, params = []) {
      const rows: SqliteRow[] = db.prepare(sql).all(...params);
      return rows;
    },
  };
}

interface SessionDoc {
  readonly transcript: string;
  readonly variant: string;
  readonly corrections: readonly { readonly original: string; readonly fixed: string }[];
}

describe('SQLite storage adapter honours the StoragePort contract', () => {
  let db: DatabaseSync;
  let storage: StoragePort;

  beforeEach(() => {
    db = new DatabaseSync(':memory:');
    storage = createSqliteStoragePort(nodeSqliteExecutor(db));
  });

  afterEach(() => {
    db.close();
  });

  it('round-trips a structured document', async () => {
    const doc: SessionDoc = {
      transcript: 'yesterday I deployed',
      variant: 'en-US',
      corrections: [{ original: 'I have make a deploy', fixed: 'I deployed' }],
    };

    await storage.put('sessions', 's1', doc);
    const loaded = await storage.read<SessionDoc>('sessions', 's1');

    expect(loaded).toEqual(doc);
  });

  it('returns null for a missing document', async () => {
    expect(await storage.read('sessions', 'missing')).toBeNull();
  });

  it('overwrites on same collection and id', async () => {
    await storage.put('sessions', 's1', { transcript: 'v1' });
    await storage.put('sessions', 's1', { transcript: 'v2' });

    expect(await storage.read('sessions', 's1')).toEqual({ transcript: 'v2' });
  });

  it('isolates collections sharing the same id', async () => {
    await storage.put('sessions', 'same-id', { transcript: 'a session' });
    await storage.put('cards', 'same-id', { word: 'deploy' });

    expect(await storage.read('sessions', 'same-id')).toEqual({ transcript: 'a session' });
    expect(await storage.read('cards', 'same-id')).toEqual({ word: 'deploy' });
  });

  it('queries by equality on top-level fields', async () => {
    await storage.put('cards', 'c1', { word: 'deploy', due: 10 });
    await storage.put('cards', 'c2', { word: 'merge', due: 10 });
    await storage.put('cards', 'c3', { word: 'deploy', due: 99 });

    const due10 = await storage.query('cards', { due: 10 });
    const deployDue10 = await storage.query('cards', { word: 'deploy', due: 10 });

    expect(due10).toHaveLength(2);
    expect(deployDue10).toEqual([{ word: 'deploy', due: 10 }]);
  });

  it('deletes a single document', async () => {
    await storage.put('cards', 'c1', { word: 'deploy' });

    await storage.delete('cards', 'c1');

    expect(await storage.read('cards', 'c1')).toBeNull();
  });

  it('erases everything across collections (right to erasure)', async () => {
    await storage.put('sessions', 's1', { transcript: 'a' });
    await storage.put('cards', 'c1', { word: 'deploy' });

    await storage.eraseAll();

    expect(await storage.read('sessions', 's1')).toBeNull();
    expect(await storage.read('cards', 'c1')).toBeNull();
    expect(await storage.query('cards', {})).toHaveLength(0);
  });

  it('survives a reopen on the same database (schema is idempotent)', async () => {
    await storage.put('sessions', 's1', { transcript: 'kept' });

    const reopened = createSqliteStoragePort(nodeSqliteExecutor(db));

    expect(await reopened.read('sessions', 's1')).toEqual({ transcript: 'kept' });
  });
});
