import { DomainError } from '../../shared/domain-error.ts';

export class PronunciationError extends DomainError {
  constructor(message: string) {
    super('pronunciation', message);
  }
}
