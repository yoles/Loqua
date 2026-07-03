// Worker dédié hébergeant SQLite : OPFS est interdit sur le thread principal
// (createSyncAccessHandle = worker-only). VFS : OPFS SyncAccessHandle Pool —
// la voie officielle sans SharedArrayBuffer ni worker imbriqué (le VFS "opfs"
// classique échoue silencieusement dans cet environnement, vérifié en live).
// Protocole : {id, op:'run'|'all', sql, params} →
// {type:'result', id, rows} | {type:'error', id, message}.
// La dist sqlite-wasm est servie statiquement à côté (voir copy-sqlite-wasm.mjs).
import sqlite3InitModule from './sqlite-wasm/index.mjs';

const sqlite3 = await sqlite3InitModule();

async function openDatabase() {
  try {
    const pool = await sqlite3.installOpfsSAHPoolVfs({ name: 'loqua' });
    return { db: new pool.OpfsSAHPoolDb('/loqua.db'), persistent: true };
  } catch {
    // OPFS indisponible (navigateur/contexte) — repli mémoire, annoncé au
    // thread principal qui DOIT l'afficher (invariant #5).
    return { db: new sqlite3.oo1.DB(':memory:', 'c'), persistent: false };
  }
}

const { db, persistent } = await openDatabase();

self.onmessage = (event) => {
  const { id, op, sql, params } = event.data;
  try {
    if (op === 'all') {
      const rows = [];
      db.exec({ sql, bind: params, rowMode: 'object', resultRows: rows });
      self.postMessage({ type: 'result', id, rows });
      return;
    }
    db.exec({ sql, bind: params });
    self.postMessage({ type: 'result', id, rows: [] });
  } catch (error) {
    self.postMessage({
      type: 'error',
      id,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};

self.postMessage({ type: 'ready', persistent });
