import { DomainError } from '../../shared/domain-error.ts';

export class GamificationError extends DomainError {
  constructor(message: string) {
    super('gamification', message);
  }
}
