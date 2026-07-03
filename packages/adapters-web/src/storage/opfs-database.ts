import sqlite3InitModule from '@sqlite.org/sqlite-wasm';

import type { SqliteExecutor, SqliteParam, SqliteRow } from './sqlite-executor.ts';

export interface OpenedSqliteDatabase {
  readonly executor: SqliteExecutor;
  // false = repli mémoire (OPFS indisponible) — le composition root DOIT le
  // rendre visible (invariant #5 : jamais de dégradation silencieuse).
  readonly persistent: boolean;
  close(): void;
}

interface Oo1Database {
  exec(opts: {
    sql: string;
    bind?: readonly SqliteParam[];
    rowMode?: 'object';
    resultRows?: SqliteRow[];
  }): unknown;
  close(): void;
}

function toExecutor(db: Oo1Database): SqliteExecutor {
  return {
    run(sql, params = []) {
      db.exec({ sql, bind: params });
    },
    all(sql, params = []) {
      const resultRows: SqliteRow[] = [];
      db.exec({ sql, bind: params, rowMode: 'object', resultRows });
      return resultRows;
    },
  };
}

export async function openSqliteDatabase(fileName = 'loqua.db'): Promise<OpenedSqliteDatabase> {
  const sqlite3 = await sqlite3InitModule();
  const supportsOpfs = 'opfs' in sqlite3;
  // Frontière de lib : les types de sqlite-wasm rejettent Record<string, unknown>
  // pour resultRows (variance), mais le contrat runtime de oo1.DB.exec est identique
  // à Oo1Database — cast unique, confiné ici, vérifié par le test d'intégration + l'app.
  const db = (supportsOpfs
    ? new sqlite3.oo1.OpfsDb(`/${fileName}`, 'c')
    : new sqlite3.oo1.DB(':memory:', 'c')) as unknown as Oo1Database;

  return {
    executor: toExecutor(db),
    persistent: supportsOpfs,
    close: () => db.close(),
  };
}
