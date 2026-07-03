import type { StoragePort } from '@loqua/core';

import type { SqliteExecutor } from './sqlite-executor.ts';

const SCHEMA_VERSION = 1;

async function ensureSchema(db: SqliteExecutor): Promise<void> {
  await db.run(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
  await db.run(
    `CREATE TABLE IF NOT EXISTS documents (
       collection TEXT NOT NULL,
       id TEXT NOT NULL,
       value TEXT NOT NULL,
       PRIMARY KEY (collection, id)
     )`,
  );
  await db.run(`INSERT OR IGNORE INTO meta (key, value) VALUES ('schema_version', ?)`, [
    String(SCHEMA_VERSION),
  ]);
}

function matchesFilter(document: unknown, filter: Record<string, unknown>): boolean {
  if (typeof document !== 'object' || document === null) {
    return Object.keys(filter).length === 0;
  }
  const fields = document as Record<string, unknown>;
  return Object.entries(filter).every(([key, expected]) => fields[key] === expected);
}

export async function createSqliteStoragePort(db: SqliteExecutor): Promise<StoragePort> {
  await ensureSchema(db);

  return {
    async read<TValue>(collection: string, id: string): Promise<TValue | null> {
      const rows = await db.all(`SELECT value FROM documents WHERE collection = ? AND id = ?`, [
        collection,
        id,
      ]);
      const raw = rows[0]?.['value'];
      if (typeof raw !== 'string') {
        return null;
      }
      // Frontière générique du port : la validation de schéma (Zod) appartient
      // au consommateur qui connaît le type attendu.
      return JSON.parse(raw) as TValue;
    },

    async put<TValue>(collection: string, id: string, value: TValue): Promise<void> {
      await db.run(`INSERT OR REPLACE INTO documents (collection, id, value) VALUES (?, ?, ?)`, [
        collection,
        id,
        JSON.stringify(value),
      ]);
    },

    async query<TValue>(collection: string, filter: Record<string, unknown>): Promise<TValue[]> {
      const rows = await db.all(
        `SELECT value FROM documents WHERE collection = ? ORDER BY id ASC`,
        [collection],
      );
      const documents = rows
        .map((row) => row['value'])
        .filter((raw): raw is string => typeof raw === 'string')
        .map((raw) => JSON.parse(raw) as unknown)
        .filter((doc) => matchesFilter(doc, filter));
      return documents as TValue[];
    },

    async delete(collection: string, id: string): Promise<void> {
      await db.run(`DELETE FROM documents WHERE collection = ? AND id = ?`, [collection, id]);
    },

    async eraseAll(): Promise<void> {
      // Droit à l'effacement (invariant #6) : tout le contenu disparaît.
      await db.run(`DELETE FROM documents`);
    },
  };
}
