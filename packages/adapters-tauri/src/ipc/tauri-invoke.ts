import { invoke } from '@tauri-apps/api/core';

// Signature alignée sur @tauri-apps/api : un payload binaire (Uint8Array) passe
// par le canal BRUT de Tauri (pas de sérialisation JSON) — c'est la seule forme
// autorisée pour l'audio, et uniquement vers le disque local (jamais le réseau).
export type TauriInvokeArgs = Record<string, unknown> | Uint8Array | ArrayBuffer;

export interface TauriInvokeOptions {
  readonly headers?: Record<string, string>;
}

export type TauriInvoke = (
  command: string,
  args?: TauriInvokeArgs,
  options?: TauriInvokeOptions,
) => Promise<unknown>;

export const tauriInvoke: TauriInvoke = (command, args, options) =>
  options?.headers === undefined
    ? invoke(command, args)
    : invoke(command, args, { headers: options.headers });

export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}
