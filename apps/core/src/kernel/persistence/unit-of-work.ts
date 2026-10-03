export interface Transaction {
  readonly tenantId: string;
  readonly kind: 'memory' | 'pg';
}

export interface PgTransaction extends Transaction {
  readonly kind: 'pg';
  query<R = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: R[]; rowCount: number }>;
}

export interface UnitOfWork {
  run<T>(tenantId: string, work: (tx: Transaction) => Promise<T>): Promise<T>;
}

export function isPgTransaction(tx: Transaction): tx is PgTransaction {
  return tx.kind === 'pg';
}

// Re-exports for compatibility
export { InMemoryUnitOfWork } from './in-memory-unit-of-work';
export { PgUnitOfWork } from './pg-unit-of-work';
export { createPool } from './pg-pool';
