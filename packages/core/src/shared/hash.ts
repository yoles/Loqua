// FNV-1a 32 bits — hash de contenu déterministe (ids dérivés, mémoïsation).
// Pas cryptographique : suffisant pour dédupliquer, jamais pour la sécurité.
const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

export function fnv1a(text: string): string {
  let hash = FNV_OFFSET_BASIS;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return (hash >>> 0).toString(16);
}
