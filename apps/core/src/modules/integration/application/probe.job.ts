import { Inject, Injectable } from '@nestjs/common';
import { TENANT_DIRECTORY, TenantDirectory } from '../../tenancy/application/ports';
import { RequestContext } from '../../../kernel/observability/request-context';
import { IntegrationContext } from './integration-context';
import { IntegrationResources } from './integration-resources';
import { IntegrationExecutor } from './integration-executor';
import { probeOutput, validateOutcome } from './canonical-validation';
@Injectable()
export class ProbeJob {
  constructor(
    @Inject(TENANT_DIRECTORY) private readonly tenants: TenantDirectory,
    private readonly context: IntegrationContext,
    private readonly resources: IntegrationResources,
    private readonly executor: IntegrationExecutor,
  ) {}
  async runOnce(): Promise<void> {
    let cursor: string | undefined;
    do {
      const page = await this.tenants.list({
        cursor,
        limit: 100
      });
      for (const tenant of page.items)
        await this.probeTenant(tenant.props.id);
      cursor = page.nextCursor;
    } while (cursor);
  }
  private async probeTenant(tenantId: string) {
    const requestContext = RequestContext.create({
      startedAtMs: this.context.runtime.clock.now().getTime()
    });
    requestContext.tenantId = tenantId;
    requestContext.actor = 'system';
    requestContext.module = 'integration';
    await RequestContext.run(requestContext, async () => {
      const pins = await this.context.uow.run(tenantId, (tx) => this.resources.pins.list(tx));
      for (const pin of pins) {
        const adapter = this.resources.registry.get(pin.adapterId, pin.version);
        if (!adapter)
          continue;
        const started = this.context.runtime.clock.now().getTime();
        const result = await this.executor.run({
          tenantId,
          adapter,
          operation: 'GET_STATUS',
          route: 'API',
          key: this.context.runtime.ids.next('iprb'),
          timeoutMs: 30000,
          invoke: async (ctx) => validateOutcome(probeOutput, await adapter.probe(ctx)),
        }, false);
        const latencyMs = result.outcome.kind === 'success' ? result.outcome.value.latencyMs
          : Math.max(0, this.context.runtime.clock.now().getTime() - started);
        await this.context.uow.run(tenantId, (tx) => this.resources.health.recordProbe(tx, pin.adapterId, pin.version, {
          at: this.context.runtime.clock.now().toISOString(),
          outcome: result.outcome.kind,
          latencyMs,
        }));
      }
      this.context.runtime.logger.info('job.completed', 'Integration probe completed', { adapters: pins.length });
    });
  }
}
