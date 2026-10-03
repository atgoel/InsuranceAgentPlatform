import { Inject, Injectable } from '@nestjs/common';
import { INBOX } from '../../../kernel/tokens';
import { Inbox } from '../../../kernel/outbox/inbox';
import { DomainEvent } from '../../../kernel/domain/domain-event';
import { DependencyUnavailableError } from '../../../kernel/errors/domain-errors';
import {
  CRM_SYNC_STATE_REPOSITORY, CrmSyncStateRepository, SyncObject, TWENTY_CLIENT, TWENTY_WORKSPACE_DIRECTORY, TwentyClient, TwentyWorkspaceDirectory, WorkspaceRef,
} from './twenty-sync.ports';
import { SyncRecordSource } from './sync-record.source';
import { CrmContext } from './crm-context';

const CONSUMER = 'crm.twenty-sync';

/**
 * M04b outbound sync: `crm.sync.requested` → load the Core record → minimised projection → upsert in the tenant's
 * Twenty workspace → record externalRef and `synced`. A failure records `failed` and rethrows so the outbox relay
 * retries (dead-letter after 3). Core writes never wait for Twenty (degraded mode).
 */
@Injectable()
export class CrmSyncWorker {
  constructor(
    @Inject(INBOX) private readonly inbox: Inbox,
    @Inject(TWENTY_CLIENT) private readonly twenty: TwentyClient,
    @Inject(TWENTY_WORKSPACE_DIRECTORY) private readonly workspaces: TwentyWorkspaceDirectory,
    @Inject(CRM_SYNC_STATE_REPOSITORY) private readonly sync: CrmSyncStateRepository,
    private readonly records: SyncRecordSource,
    private readonly ctx: CrmContext,
  ) {}

  handle(event: DomainEvent<{ object: SyncObject; id: string }>): Promise<boolean> {
    return this.inbox.processOnce(CONSUMER, event.id, async () => {
      const workspace = await this.workspaces.forTenant(event.tenantId);
      if (!workspace) return this.ctx.logger.info('crm.sync.skipped', 'No Twenty workspace for tenant', { object: event.data.object });
      await this.syncOne(workspace, event.data.object, event.data.id);
    });
  }

  private async syncOne(workspace: WorkspaceRef, object: SyncObject, id: string): Promise<void> {
    const started = this.ctx.clock.now().getTime();
    try {
      await this.ctx.uow.run(workspace.tenantId, async (tx) => {
        const fields = await this.records.project(tx, object, id);
        if (!fields) return;
        const previous = await this.sync.get(tx, object, id);
        const result = await this.twenty.upsert(workspace, object, previous?.externalRef, fields);
        this.assertWorkspace(workspace, result.workspaceId, object);
        await this.sync.set(tx, object, id, { state: 'synced', externalRef: result.id, attempts: 0, updatedAt: this.now() });
      });
      this.outcome(object, 'synced', started);
    } catch (error) {
      await this.ctx.uow.run(workspace.tenantId, async (tx) => {
        const previous = await this.sync.get(tx, object, id);
        const lastError = error instanceof Error ? error.message.slice(0, 200) : 'unknown';
        await this.sync.set(tx, object, id, { ...previous, state: 'failed', attempts: (previous?.attempts ?? 0) + 1, lastError, updatedAt: this.now() });
      });
      this.outcome(object, 'failed', started);
      throw error;
    }
  }

  /** A response from another workspace means a misrouted key or a compromised proxy: never record it. */
  private assertWorkspace(workspace: WorkspaceRef, returned: string, object: SyncObject): void {
    if (returned === workspace.workspaceId) return;
    this.ctx.logger.security('security.twenty_workspace_mismatch', 'Twenty answered from a different workspace', { object, expected: workspace.workspaceId, returned });
    throw new DependencyUnavailableError('twenty');
  }

  private outcome(object: SyncObject, outcome: 'synced' | 'failed', started: number): void {
    this.ctx.metrics.counter('crm_sync_total', 'Twenty sync attempts', ['object', 'outcome']).inc({ object, outcome });
    this.ctx.metrics.histogram('crm_sync_seconds', 'Twenty sync latency', ['object'], [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5]).observe((this.ctx.clock.now().getTime() - started) / 1000, { object });
  }

  private now(): string {
    return this.ctx.clock.now().toISOString();
  }
}
