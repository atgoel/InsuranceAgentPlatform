import { Injectable } from '@nestjs/common';
import { BusinessRuleError, NotFoundError } from '../../../kernel/errors/domain-errors';
import { Principal } from '../../../kernel/tenancy/principal';
import { IntegrationContext } from './integration-context';
import { IntegrationResources } from './integration-resources';
@Injectable()
export class IntegrationAdminService {
  constructor(private readonly context: IntegrationContext, private readonly resources: IntegrationResources) { }
  async pin(principal: Principal, adapterId: string, version: string) {
    if (!this.resources.registry.all().some((adapter) => adapter.manifest().adapterId === adapterId))
      throw new NotFoundError('adapter');
    if (!this.resources.registry.get(adapterId, version))
      throw new BusinessRuleError('adapter_version_unavailable', 'Adapter version unavailable');
    const result = {
      adapterId,
      version,
      updatedAt: this.context.runtime.clock.now().toISOString()
    };
    await this.context.uow.run(principal.tenantId, async (tx) => {
      await this.resources.pins.put(tx, result);
      await this.context.audit.append(tx, {
        action: 'integration.adapter.pinned',
        entityType: 'Adapter',
        entityId: adapterId
      });
    });
    return result;
  }
  async list(principal: Principal) {
    return this.context.uow.run(principal.tenantId, async (tx) => {
      const pins = await this.resources.pins.list(tx);
      const items = await Promise.all(this.resources.registry.all().map(async (adapter) => {
        const manifest = adapter.manifest();
        const health = await this.resources.health.get(tx, manifest.adapterId, manifest.adapterVersion);
        const last = health?.probes.at(-1);
        const sorted = health?.probes.map((probe) => probe.latencyMs).sort((a, b) => a - b) ?? [];
        const operations = [...new Set(manifest.lines.flatMap((line) => line.operations.map((operation) => operation.operation)))];
        return {
          adapterId: manifest.adapterId,
          adapterVersion: manifest.adapterVersion,
          counterparty: manifest.counterparty,
          pin: pins.find((pin) => pin.adapterId === manifest.adapterId),
          certification: await this.resources.certifications.get(tx, manifest.adapterId, manifest.adapterVersion),
          breakers: await Promise.all(operations.map(async (operation) => ({
            operation,
            state: (await this.resources.breakers.get(manifest.adapterId, manifest.adapterVersion, operation))?.state ?? 'CLOSED',
          }))),
          lastProbe: last ? {
            ...last,
            lastOkAt: health?.lastOkAt,
            p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1]
          } : undefined,
        };
      }));
      return {
        items
      };
    });
  }
}
