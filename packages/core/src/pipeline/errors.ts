import { DomainError } from '../shared/domain-error.ts';

export class PipelineError extends DomainError {
  constructor(message: string) {
    super('pipeline', message);
  }
}
