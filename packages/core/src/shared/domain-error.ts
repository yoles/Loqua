export type BoundedContext =
  | 'shared'
  | 'correction'
  | 'pronunciation'
  | 'srs'
  | 'gamification'
  | 'identity'
  | 'pipeline';

export abstract class DomainError extends Error {
  protected constructor(
    readonly context: BoundedContext,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class SharedError extends DomainError {
  constructor(message: string) {
    super('shared', message);
  }
}
