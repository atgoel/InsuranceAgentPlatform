import { UnitOfWork, Transaction } from './unit-of-work';

export class InMemoryUnitOfWork implements UnitOfWork {
  async run<T>(tenantId: string, work: (tx: Transaction) => Promise<T>): Promise<T> {
    const tx: Transaction = { tenantId, kind: 'memory' };
    return work(tx);
  }
}
