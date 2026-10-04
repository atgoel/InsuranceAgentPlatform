import { Inject, Injectable } from '@nestjs/common';
import { RequestContext } from '../../../kernel/observability/request-context';
import { TENANT_DIRECTORY, TenantDirectory } from '../../tenancy/application/ports';
import { integrationPolicy } from '../domain/integration-policy';
import { IntegrationContext } from './integration-context';
import { IntegrationResources, IntegrationWork } from './integration-resources';

@Injectable()
export class RetentionJob {
  constructor(
    @Inject(TENANT_DIRECTORY) private readonly tenants: TenantDirectory,
    private readonly context: IntegrationContext,
    private readonly resources: IntegrationResources,
    private readonly work: IntegrationWork,
  ) {}

  async runOnce(): Promise<void> {
    let cursor: string | undefined;
    let open = 0;
    do {
      const page = await this.tenants.list({ cursor, limit: 100 });
      for (const tenant of page.items) open += await this.runTenant(tenant.props.id);
      cursor = page.nextCursor;
    } while (cursor);
    this.context.runtime.metrics.gauge('integration_dead_letters_open', 'Open integration dead letters').set(open);
  }

  private async runTenant(tenantId: string): Promise<number> {
    const now = this.context.runtime.clock.now();
    const ctx = RequestContext.create({ startedAtMs: now.getTime() });
    ctx.tenantId = tenantId;
    ctx.actor = 'system';
    ctx.module = 'integration';
    return RequestContext.run(ctx, async () => {
      const counts = await this.context.uow.run(tenantId, async (tx) => ({
        calls: await this.resources.calls.purgeBefore(tx, new Date(now.getTime() - integrationPolicy.callRetentionMs).toISOString()),
        payloads: await this.work.payloads.purgeBefore(tx, now.toISOString()),
        callbacks: await this.work.callbacks.purgeExpired(tx, now.toISOString()),
        proposals: await this.work.submissions.purgeProposalBefore(tx, new Date(now.getTime() - integrationPolicy.payloadRetentionMs).toISOString()),
      }));
      const open = await this.countOpen(tenantId);
      this.context.runtime.logger.info('job.completed', 'Integration retention completed', { ...counts, open });
      return open;
    });
  }

  private async countOpen(tenantId: string): Promise<number> {
    let cursor: string | undefined;
    let count = 0;
    do {
      const page = await this.context.uow.run(tenantId, (tx) => this.work.letters.list(tx, { status: 'OPEN', cursor, limit: 100 }));
      count += page.items.length;
      cursor = page.nextCursor;
    } while (cursor);
    return count;
  }
}
