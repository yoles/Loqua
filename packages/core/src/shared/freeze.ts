export function deepFreeze<TValue extends object>(value: TValue): Readonly<TValue> {
  for (const nested of Object.values(value)) {
    if (typeof nested === 'object' && nested !== null && !Object.isFrozen(nested)) {
      deepFreeze(nested);
    }
  }
  return Object.freeze(value);
}
