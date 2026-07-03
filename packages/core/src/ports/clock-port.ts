// Le temps est TOUJOURS injecté — jamais Date.now() dans le core (déterminisme des tests).
export interface ClockPort {
  now(): number;
  timezone(): string;
}
