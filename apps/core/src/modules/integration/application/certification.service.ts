import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError, BusinessRuleError } from '../../../kernel/errors/domain-errors';
import { Principal } from '../../../kernel/tenancy/principal';
import { SANDBOX_CERTIFICATION_RUNNER, SandboxCertificationRunner, Certification } from './ports';
import { IntegrationContext } from './integration-context';
import { IntegrationResources } from './integration-resources';
@Injectable()
export class CertificationService {
  constructor(private readonly context: IntegrationContext, private readonly resources: IntegrationResources,
  @Inject(SANDBOX_CERTIFICATION_RUNNER)
  private readonly runner: SandboxCertificationRunner) { }
  async run(principal: Principal, adapterId: string): Promise<Certification> {
    if (!this.resources.registry.all().some((adapter) => adapter.manifest().adapterId === adapterId))
      throw new NotFoundError('adapter');
    const pins = await this.context.uow.run(principal.tenantId, (tx) => this.resources.pins.list(tx));
    const version = pins.find((pin) => pin.adapterId === adapterId)?.version;
    const adapter = this.resources.registry.get(adapterId, version);
    if (!adapter)
      throw new BusinessRuleError('adapter_version_unavailable', 'Adapter version unavailable');
    const checks = await this.runner.run(adapterId, adapter.manifest().adapterVersion);
    const expected = ['HAPPY_PATH', 'DECLINE', 'TIMEOUT', 'DUPLICATE_CALLBACK', 'SCHEMA_DRIFT'];
    const passed = checks.length === expected.length && expected.every((kind) => checks.filter((check) => check.kind === kind && check.passed).length === 1);
    const result: Certification = {
      adapterId,
      adapterVersion: adapter.manifest().adapterVersion,
      checkedAt: this.context.runtime.clock.now().toISOString(),
      status: passed ? 'PASSED' : 'FAILED',
      checks: checks.map((check) => ({
        kind: check.kind,
        passed: check.passed,
        code: check.passed ? undefined : 'dependency_unavailable'
      })),
    };
    await this.context.uow.run(principal.tenantId, async (tx) => {
      await this.resources.certifications.save(tx, result);
      await this.context.audit.append(tx, {
        action: 'integration.certification.run',
        entityType: 'Adapter',
        entityId: adapterId
      });
    });
    return result;
  }
}
