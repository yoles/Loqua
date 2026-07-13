export type BoundedContext =
  'shared' | 'correction' | 'pronunciation' | 'srs' | 'gamification' | 'identity' | 'pipeline';

export abstract class DomainError extends Error {
  readonly context: BoundedContext;

  protected constructor(context: BoundedContext, message: string) {
    super(message);
    this.context = context;
    this.name = new.target.name;
  }
}

export class SharedError extends DomainError {
  constructor(message: string) {
    super('shared', message);
  }
}
