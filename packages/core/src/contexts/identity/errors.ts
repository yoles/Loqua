import { DomainError } from '../../shared/domain-error.ts';

export class IdentityError extends DomainError {
  constructor(message: string) {
    super('identity', message);
  }
}
