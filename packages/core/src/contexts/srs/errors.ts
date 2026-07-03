import { DomainError } from '../../shared/domain-error.ts';

export class SrsError extends DomainError {
  constructor(message: string) {
    super('srs', message);
  }
}
