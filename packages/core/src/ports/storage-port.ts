export interface StoragePort {
  read<TValue>(collection: string, id: string): Promise<TValue | null>;
  put<TValue>(collection: string, id: string, value: TValue): Promise<void>;
  query<TValue>(collection: string, filter: Record<string, unknown>): Promise<TValue[]>;
  delete(collection: string, id: string): Promise<void>;
  eraseAll(): Promise<void>; // droit à l'effacement (invariant #6)
}
