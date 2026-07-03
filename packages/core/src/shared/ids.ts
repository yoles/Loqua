import { SharedError } from './domain-error.ts';

declare const idBrand: unique symbol;
type Id<TKind extends string> = string & { readonly [idBrand]: TKind };

export type SessionId = Id<'session'>;
export type CardId = Id<'card'>;
export type ClipId = Id<'clip'>;
export type AttemptId = Id<'attempt'>;

function makeId<TKind extends string>(kind: TKind, raw: string): Id<TKind> {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new SharedError(`a ${kind} id cannot be empty`);
  }
  return trimmed as Id<TKind>;
}

export function makeSessionId(raw: string): SessionId {
  return makeId('session', raw);
}

export function makeCardId(raw: string): CardId {
  return makeId('card', raw);
}

export function makeClipId(raw: string): ClipId {
  return makeId('clip', raw);
}

export function makeAttemptId(raw: string): AttemptId {
  return makeId('attempt', raw);
}
