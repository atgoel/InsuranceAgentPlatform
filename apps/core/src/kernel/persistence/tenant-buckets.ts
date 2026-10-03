import { Transaction } from './unit-of-work';

/** Per-tenant buckets for in-memory adapters: keyed by tx.tenantId, mirroring Postgres RLS isolation. */
export class TenantBuckets<T> {
  private readonly buckets = new Map<string, T>();

  constructor(private readonly init: () => T) {}

  of(tx: Transaction): T {
    let bucket = this.buckets.get(tx.tenantId);
    if (!bucket) {
      bucket = this.init();
      this.buckets.set(tx.tenantId, bucket);
    }
    return bucket;
  }
}
