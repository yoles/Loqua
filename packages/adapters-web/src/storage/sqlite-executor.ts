// Couture minimale entre la logique du port (SQL) et le moteur SQLite réel :
// worker sqlite-wasm/OPFS en prod navigateur (async par nature — postMessage),
// node:sqlite dans les tests d'intégration.
export type SqliteParam = string | number | null;

export type SqliteRow = Record<string, unknown>;

export interface SqliteExecutor {
  run(sql: string, params?: readonly SqliteParam[]): Promise<void>;
  all(sql: string, params?: readonly SqliteParam[]): Promise<SqliteRow[]>;
}
