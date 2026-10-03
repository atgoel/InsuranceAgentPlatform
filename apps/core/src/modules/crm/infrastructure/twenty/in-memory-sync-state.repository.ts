import { Injectable } from '@nestjs/common';
import { Transaction } from '../../../../kernel/persistence/unit-of-work';
import { TenantBuckets } from '../../../../kernel/persistence/tenant-buckets';
import { CrmSyncStateRepository, SyncObject, SyncStatus } from '../../application/twenty-sync.ports';

/** Sync bookkeeping per tenant (Postgres: the sync_state / external_ref columns, updated without a version bump). */
@Injectable()
export class InMemoryCrmSyncStateRepository implements CrmSyncStateRepository {
  private readonly rows = new TenantBuckets(() => new Map<string, SyncStatus>());

  async get(tx: Transaction, object: SyncObject, id: string): Promise<SyncStatus | undefined> {
    const row = this.rows.of(tx).get(`${object}:${id}`);
    return row && { ...row };
  }

  async set(tx: Transaction, object: SyncObject, id: string, status: SyncStatus): Promise<void> {
    this.rows.of(tx).set(`${object}:${id}`, { ...status });
  }
}
