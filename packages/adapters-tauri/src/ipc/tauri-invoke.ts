import { invoke } from '@tauri-apps/api/core';

export type TauriInvoke = (
  command: string,
  args?: Record<string, unknown>,
) => Promise<unknown>;

export const tauriInvoke: TauriInvoke = (command, args) => invoke(command, args);

export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}
