import { DomainError } from '../../shared/domain-error.ts';

export class CorrectionError extends DomainError {
  constructor(message: string) {
    super('correction', message);
  }
}
