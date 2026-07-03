// Composition root de l'app web : seul endroit qui instancie les adapters
// et les injecte dans les use-cases du core (ARCHITECTURE §5, §20).
// Rempli au Sprint 2 (lot 2.7) — Next.js arrive au lot 2.6.
import { VARIANTS } from '@loqua/core';

export const DEFAULT_VARIANT = VARIANTS[0];
