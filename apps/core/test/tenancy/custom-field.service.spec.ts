import { FixedClock } from '../../src/kernel/domain/clock';
import { SequentialIdGenerator } from '../../src/kernel/domain/id-generator';
import { InMemoryUnitOfWork } from '../../src/kernel/persistence/in-memory-unit-of-work';
import { InMemoryOutbox } from '../../src/kernel/outbox/outbox';
import { InMemoryAuditLog } from '../../src/kernel/audit/audit-log';
import { Redactor } from '../../src/kernel/observability/redactor';
import { Principal } from '../../src/kernel/tenancy/principal';
import { BusinessRuleError, ConflictError, NotFoundError, PreconditionFailedError, ValidationError } from '../../src/kernel/errors/domain-errors';
import { DefineCustomFieldInput } from '../../src/kernel/custom-fields';
import { PlanCatalogue } from '../../src/modules/tenancy/domain/plan';
import { Tenant } from '../../src/modules/tenancy/domain/tenant';
import { InMemoryCustomFieldRepository } from '../../src/modules/tenancy/infrastructure/in-memory-custom-field.repository';
import { CustomFieldService } from '../../src/modules/tenancy/application/custom-field.service';
import { TenancyRecorder } from '../../src/modules/tenancy/application/tenancy-recorder';
import { TenantQueryService } from '../../src/modules/tenancy/application/tenant-query.service';

const principal = (tenantId: string): Principal => ({ userRef: 'usr_1', tenantId, roles: ['TENANT_ADMIN'], realm: 'workforce' });
const tenantOn = (planCode: 'SOLO' | 'BUSINESS') => ({ props: { planCode } }) as unknown as Tenant;

function build(planCode: 'SOLO' | 'BUSINESS' = 'BUSINESS') {
  const clock = new FixedClock(new Date('2026-10-03T06:00:00.000Z'));
  const ids = new SequentialIdGenerator();
  const outbox = new InMemoryOutbox();
  const audit = new InMemoryAuditLog(clock, ids, new Redactor());
  const tenants = { require: async () => tenantOn(planCode) } as unknown as TenantQueryService;
  const service = new CustomFieldService(
    new InMemoryCustomFieldRepository(), PlanCatalogue.default(), new InMemoryUnitOfWork(), clock, ids, tenants, new TenancyRecorder(outbox, audit, clock, ids),
  );
  return { service, outbox, audit };
}

const branchCode: DefineCustomFieldInput = { entity: 'party', key: 'branch_code', label: { en: 'Branch code' }, type: 'text', piiClass: 'P0', reportable: true };

describe('AC-CR001-04 CustomFieldService', () => {
  it('AC-CR001-04 define stores a cfd_ definition and reports usage against the plan limit', async () => {
    const { service } = build('BUSINESS');
    const def = await service.define(principal('ten_a'), branchCode);
    expect(def.id).toBe('cfd_0001');
    expect(def).toMatchObject({ entity: 'party', key: 'branch_code', piiClass: 'P0', reportable: true, active: true, version: 1, createdAt: '2026-10-03T06:00:00.000Z' });
    const listed = await service.list(principal('ten_a'));
    expect(listed.usage).toEqual({ active: 1, limit: 50 });
    expect(listed.items.map((d) => d.key)).toEqual(['branch_code']);
  });

  it('AC-CR001-04 list filters by entity', async () => {
    const { service } = build();
    await service.define(principal('ten_a'), branchCode);
    await service.define(principal('ten_a'), { ...branchCode, entity: 'lead', key: 'source_ref' });
    expect((await service.list(principal('ten_a'), 'lead')).items.map((d) => d.key)).toEqual(['source_ref']);
  });

  it('AC-CR001-04 the limit comes from the tenant plan (SOLO = 10) and the 11th definition is refused with the limit', async () => {
    const { service } = build('SOLO');
    for (let i = 0; i < 10; i++) await service.define(principal('ten_a'), { ...branchCode, key: `field_${String(i).padStart(2, '0')}` });
    const error = await service.define(principal('ten_a'), { ...branchCode, key: 'field_extra' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BusinessRuleError);
    expect(error).toMatchObject({ code: 'custom_field_limit_reached', details: { limit: 10 } });
  });

  it('AC-CR001-04 P3 is refused with pii_class_not_allowed and nothing is stored', async () => {
    const { service, outbox } = build();
    const error = await service.define(principal('ten_a'), { ...branchCode, piiClass: 'P3' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ValidationError);
    expect(error).toMatchObject({ code: 'pii_class_not_allowed' });
    expect((await service.list(principal('ten_a'))).items).toEqual([]);
    expect(outbox.events).toEqual([]);
  });

  it('AC-CR001-04 a duplicate (entity, key) is a 409 custom_field_exists', async () => {
    const { service } = build();
    await service.define(principal('ten_a'), branchCode);
    const error = await service.define(principal('ten_a'), branchCode).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConflictError);
    expect(error).toMatchObject({ code: 'custom_field_exists' });
  });

  it('AC-CR001-04 define emits an audit entry and tenant.custom_field.defined carrying ids and keys only', async () => {
    const { service, outbox, audit } = build();
    const def = await service.define(principal('ten_a'), branchCode);
    expect(outbox.events).toHaveLength(1);
    expect(outbox.events[0]).toMatchObject({ type: 'tenant.custom_field.defined', tenantId: 'ten_a', data: { id: def.id, entity: 'party', key: 'branch_code', piiClass: 'P0' } });
    expect(audit.events).toHaveLength(1);
    expect(audit.events[0]).toMatchObject({ action: 'tenant.custom_field.defined', entityType: 'custom_field_definition', entityId: def.id, tenantId: 'ten_a' });
  });

  it('AC-CR001-04 revise bumps the version, emits tenant.custom_field.revised and audits it', async () => {
    const { service, outbox, audit } = build();
    const def = await service.define(principal('ten_a'), branchCode);
    const next = await service.revise(principal('ten_a'), def.id, { label: { en: 'Branch' }, active: false }, 1);
    expect(next).toMatchObject({ version: 2, active: false, label: { en: 'Branch' } });
    expect(outbox.events[1]).toMatchObject({ type: 'tenant.custom_field.revised', data: { id: def.id, version: 2, active: false } });
    expect(audit.events[1]).toMatchObject({ action: 'tenant.custom_field.revised', entityId: def.id });
  });

  it('AC-CR001-04 revise with a stale version is a PreconditionFailedError and changes nothing', async () => {
    const { service } = build();
    const def = await service.define(principal('ten_a'), branchCode);
    await service.revise(principal('ten_a'), def.id, { required: true }, 1);
    await expect(service.revise(principal('ten_a'), def.id, { required: false }, 1)).rejects.toBeInstanceOf(PreconditionFailedError);
    expect((await service.list(principal('ten_a'))).items[0]).toMatchObject({ required: true, version: 2 });
  });

  it('AC-CR001-04 revise of an unknown id is NotFoundError and another tenant cannot see the definition', async () => {
    const { service } = build();
    const def = await service.define(principal('ten_a'), branchCode);
    await expect(service.revise(principal('ten_b'), def.id, { required: true }, 1)).rejects.toBeInstanceOf(NotFoundError);
    expect((await service.list(principal('ten_b'))).items).toEqual([]);
  });
});
