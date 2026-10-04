import { FixedClock } from '../../src/kernel/domain/clock';
import { SequentialIdGenerator } from '../../src/kernel/domain/id-generator';
import { InMemoryUnitOfWork } from '../../src/kernel/persistence/in-memory-unit-of-work';
import { InMemoryOutbox } from '../../src/kernel/outbox/outbox';
import { InMemoryAuditLog } from '../../src/kernel/audit/audit-log';
import { Redactor } from '../../src/kernel/observability/redactor';
import { Logger } from '../../src/kernel/observability/logger';
import { MemoryLogSink } from '../../src/kernel/observability/log-sink';
import { ErrorDeduplicator } from '../../src/kernel/observability/error-deduplicator';
import { LogOverrideStore } from '../../src/kernel/observability/log-overrides';
import { ConflictError } from '../../src/kernel/errors/domain-errors';
import {
  InMemoryProvisioningStateRepository,
  InMemoryTenantDirectory,
  InMemoryTenantSettingsRepository,
} from '../../src/modules/tenancy/infrastructure/in-memory-tenancy.repositories';
import { StubContentProvisioner, StubIdentityProvisioner } from '../../src/modules/tenancy/infrastructure/stub-provisioners';
import {
  ContentScopeStep,
  CrmWorkspaceStep,
  IdentityAdminStep,
  IdentityOrganisationStep,
  ProvisioningSaga,
  SmokeCheckStep,
} from '../../src/modules/tenancy/application/provisioning-saga';
import { ProvisionTenantInput, ProvisionTenantService } from '../../src/modules/tenancy/application/provision-tenant.service';
import { TenancyRecorder } from '../../src/modules/tenancy/application/tenancy-recorder';
import { CrmProvisioner } from '../../src/modules/tenancy/application/ports';
import { CrmMode } from '../../src/modules/tenancy/domain/tenant';

/** CRM provisioner that fails until told to recover — simulates Twenty being down during provisioning. */
class FlakyCrm implements CrmProvisioner {
  down = true;
  calls = 0;
  async ensureWorkspace(_tenantId: string, _mode: CrmMode): Promise<{ workspaceRef?: string }> {
    this.calls += 1;
    if (this.down) throw new Error('twenty unavailable');
    return { workspaceRef: 'ws_1' };
  }
}

function build() {
  const clock = new FixedClock(new Date('2026-10-03T00:00:00Z'));
  const ids = new SequentialIdGenerator();
  const sink = new MemoryLogSink();
  const logger = new Logger({
    sink,
    redactor: new Redactor(),
    dedup: new ErrorDeduplicator(clock),
    overrides: new LogOverrideStore(clock, ids),
    clock,
  });
  const directory = new InMemoryTenantDirectory();
  const settings = new InMemoryTenantSettingsRepository();
  const state = new InMemoryProvisioningStateRepository();
  const outbox = new InMemoryOutbox();
  const identity = new StubIdentityProvisioner(logger);
  const identityCalls: string[] = [];
  const spyIdentity = {
    ensureOrganisation: async (t: string, s: string) => {
      identityCalls.push('org');
      return identity.ensureOrganisation(t, s);
    },
    ensureAdmin: async (t: string) => {
      identityCalls.push('admin');
      return identity.ensureAdmin(t);
    },
  };
  const crm = new FlakyCrm();
  const saga = new ProvisioningSaga(
    [
      new IdentityOrganisationStep(spyIdentity),
      new IdentityAdminStep(spyIdentity),
      new CrmWorkspaceStep(crm),
      new ContentScopeStep(new StubContentProvisioner(logger)),
      new SmokeCheckStep(directory),
    ],
    state,
    logger,
  );
  const recorder = new TenancyRecorder(outbox, new InMemoryAuditLog(clock, ids, new Redactor()), clock, ids);
  const service = new ProvisionTenantService(
    directory,
    settings,
    saga,
    new InMemoryUnitOfWork(),
    clock,
    ids,
    { platformDomain: 'iap.test', otpPepper: 'p', cacheTtlMs: 1000 },
    recorder,
  );
  return { service, crm, identityCalls, outbox, sink, directory, state };
}

const input: ProvisionTenantInput = {
  slug: 'sunrise-imf',
  displayName: 'Sunrise IMF',
  kind: 'ORGANISATION',
  planCode: 'TEAM',
  entity: {
    entityType: 'IMF',
    legalName: 'Sunrise IMF Pvt Ltd',
    registrationNo: 'IMF-123',
    registrationValidTo: '2028-03-31',
    principalOfficerName: 'A. Rao',
  },
  admin: { name: 'Admin' },
};

describe('AC-M01-07 / AC-M01-08 ProvisionTenantService with the provisioning saga', () => {
  it('AC-M01-08 stops at the failing step, leaves the tenant provisioning and records the failure', async () => {
    const { service, outbox, sink, state } = build();

    const result = await service.provision(input);

    expect(result).toEqual(expect.objectContaining({ status: 'provisioning', failedStep: 'crm.workspace', host: 'sunrise-imf.iap.test' }));
    expect(outbox.events.map((e) => e.type)).toEqual(['tenant.tenant.provisioning_started']);
    expect(sink.byEvent('tenant.provisioning.step_failed')[0].ctx).toEqual(expect.objectContaining({ step: 'crm.workspace' }));
    expect(state.lastFailure(result.tenantId)?.step).toBe('crm.workspace');
  });

  it('AC-M01-08 resumption skips completed steps and activates the tenant', async () => {
    const { service, crm, identityCalls, outbox } = build();
    const first = await service.provision(input);
    crm.down = false;

    const resumed = await service.resume(first.tenantId);

    expect(resumed.status).toBe('active');
    expect(identityCalls).toEqual(['org', 'admin']); // identity steps not repeated on resume
    expect(crm.calls).toBe(2);
    expect(outbox.events.map((e) => e.type)).toContain('tenant.tenant.provisioned');
  });

  it('AC-M01-07 rejects a duplicate slug before writing anything', async () => {
    const { service, crm } = build();
    crm.down = false;
    await service.provision(input);

    await expect(service.provision(input)).rejects.toThrow(ConflictError);
  });

  it('AC-M01-07 validates the entity before creating the tenant (no orphan tenant)', async () => {
    const { service, directory } = build();

    await expect(service.provision({ ...input, entity: { ...input.entity, principalOfficerName: undefined } })).rejects.toThrow();
    expect(await directory.findBySlug('sunrise-imf')).toBeUndefined();
  });
});
