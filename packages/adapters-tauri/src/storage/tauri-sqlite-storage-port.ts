import { z } from 'zod';

import type { StoragePort } from '@loqua/core';
import type { TauriInvoke } from '../ipc/tauri-invoke.ts';

// Mapping StoragePort ↔ commandes IPC typées (jamais de SQL brut sur l'IPC, §15).
// Le SQL et la validation des entrées vivent côté Rust (src-tauri/storage.rs).
const STORAGE_COMMANDS = {
  READ: 'storage_read',
  PUT: 'storage_put',
  QUERY: 'storage_query',
  DELETE: 'storage_delete',
  ERASE_ALL: 'storage_erase_all',
} as const;

const readResponseSchema = z.string().nullable();
const queryResponseSchema = z.array(z.string());

function nativeStorageError(command: string, error: unknown): Error {
  const detail = error instanceof Error ? error.message : String(error);
  return new Error(`native-storage-failed (${command}): ${detail}`);
}

function parseStoredJson(command: string, raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch (error: unknown) {
    throw nativeStorageError(command, error);
  }
}

function matchesFilter(document: unknown, filter: Record<string, unknown>): boolean {
  if (typeof document !== 'object' || document === null) {
    return Object.keys(filter).length === 0;
  }
  const fields = document as Record<string, unknown>;
  return Object.entries(filter).every(([key, expected]) => fields[key] === expected);
}

export function createTauriSqliteStoragePort(invoke: TauriInvoke): StoragePort {
  async function call(command: string, args: Record<string, unknown>): Promise<unknown> {
    try {
      return await invoke(command, args);
    } catch (error: unknown) {
      throw nativeStorageError(command, error);
    }
  }

  return {
    async read<TValue>(collection: string, id: string): Promise<TValue | null> {
      const response = await call(STORAGE_COMMANDS.READ, { collection, id });
      const parsed = readResponseSchema.safeParse(response);
      if (!parsed.success) {
        throw nativeStorageError(STORAGE_COMMANDS.READ, parsed.error);
      }
      if (parsed.data === null) {
        return null;
      }
      return parseStoredJson(STORAGE_COMMANDS.READ, parsed.data) as TValue;
    },

    async put<TValue>(collection: string, id: string, value: TValue): Promise<void> {
      await call(STORAGE_COMMANDS.PUT, { collection, id, value: JSON.stringify(value) });
    },

    async query<TValue>(collection: string, filter: Record<string, unknown>): Promise<TValue[]> {
      const response = await call(STORAGE_COMMANDS.QUERY, { collection });
      const parsed = queryResponseSchema.safeParse(response);
      if (!parsed.success) {
        throw nativeStorageError(STORAGE_COMMANDS.QUERY, parsed.error);
      }
      return parsed.data
        .map((raw) => parseStoredJson(STORAGE_COMMANDS.QUERY, raw))
        .filter((doc) => matchesFilter(doc, filter)) as TValue[];
    },

    async delete(collection: string, id: string): Promise<void> {
      await call(STORAGE_COMMANDS.DELETE, { collection, id });
    },

    async eraseAll(): Promise<void> {
      await call(STORAGE_COMMANDS.ERASE_ALL, {});
    },
  };
}
