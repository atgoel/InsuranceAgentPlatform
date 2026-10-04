import { Injectable } from '@nestjs/common';
import { BusinessRuleError } from '../../../kernel/errors/domain-errors';
import { CanonicalTarget } from '../domain/canonical';
import { Operation, RouteKind } from '../domain/capability-manifest';
import { RouteSelector } from '../domain/route-selector';
import { IntegrationContext } from './integration-context';
import { IntegrationResources } from './integration-resources';
import { IntegrationExecutor } from './integration-executor';
@Injectable()
export class IntegrationRouting {
  constructor(
    private readonly context: IntegrationContext,
    private readonly resources: IntegrationResources,
    private readonly executor: IntegrationExecutor
  ) { }
  async select(tenantId: string, input: CanonicalTarget, operation: Operation) {
    const adapters = this.resources.registry.all();
    const manifests = adapters.map((adapter) => adapter.manifest());
    const metadata = await this.context.uow.run(tenantId, async (tx) => ({
      tenantPins: await this.resources.pins.list(tx),
      certifications: (await Promise.all(manifests.map((m) => this.resources.certifications.get(tx, m.adapterId, m.adapterVersion))))
        .filter((value) => value !== undefined),
    }));
    const breakerStates = adapters.map((adapter) => ({
      adapterId: adapter.manifest().adapterId,
      adapterVersion: adapter.manifest().adapterVersion,
      operation,
      state: this.executor.state(adapter, operation),
    }));
    return new RouteSelector().select({
      ...metadata,
      manifests,
      ...input,
      operation,
      breakerStates
    });
  }
  bound(adapterId: string, version: string) {
    const adapter = this.resources.registry.get(adapterId, version);
    if (!adapter)
      throw new BusinessRuleError('adapter_version_unavailable', 'Adapter version unavailable');
    return adapter;
  }
  timeout(adapterId: string, version: string, input: CanonicalTarget, operation: Operation): number {
    return this.spec(adapterId, version, input, operation)?.timeoutMs ?? 30000;
  }

  spec(adapterId: string, version: string, input: CanonicalTarget, operation: Operation, route?: RouteKind) {
    const specs = this.bound(adapterId, version).manifest().lines
      .filter((entry) => entry.line === input.line).flatMap((entry) => entry.operations)
      .filter((entry) => entry.operation === operation);
    if (route) return specs.find((entry) => entry.route === route);
    return specs.find((entry) => entry.route === 'API') ?? specs.find((entry) => entry.route === 'FILE');
  }
}
