import { TestApp } from '../support/test-app';
import { tokenFor } from '../support/tokens';
import { newIdempotencyKey } from '../support/idempotency';
import { activateSeller } from '../distribution/fixtures';
import { UNIT_OF_WORK } from '../../src/kernel/tokens';
import { UnitOfWork } from '../../src/kernel/persistence/unit-of-work';
import { TENANT_SETTINGS_REPOSITORY, TenantSettingsRepository } from '../../src/modules/tenancy/application/ports';
import { DistributorEntity } from '../../src/modules/tenancy/domain/distributor-entity';

let phoneCounter = 0;

export const HOST = 'acme.iap.test';
export const adminToken = (tenantId = 'ten_acme') => tokenFor({ tenantId, roles: ['TENANT_ADMIN'] });

/** Replaces the tenant's tie-ups (M01). Effective from well before the test clock. */
export async function tieUps(app: TestApp, pairs: Array<[insurerId: string, line: 'LIFE' | 'HEALTH' | 'GENERAL']>, host = HOST, tenantId = 'ten_acme'): Promise<void> {
  const res = await app.http.put('/api/v1/tenant/tie-ups').set('Host', host).set('Authorization', `Bearer ${adminToken(tenantId)}`)
    .send({ tieUps: pairs.map(([insurerId, line]) => ({ insurerId, line, effectiveFrom: '2025-01-01' })) });
  if (res.status !== 200) throw new Error(`tie-ups failed: ${res.status} ${JSON.stringify(res.body)}`);
}

/**
 * Creates an active seller through the M02 API and returns a SALESPERSON token for it. POSPs are licence-bound:
 * pass the licence kinds that give them lines (POSP_LIFE → LIFE, POSP_GENERAL → HEALTH + GENERAL).
 */
export async function sellerToken(app: TestApp, type: 'EMPLOYEE' | 'POSP', licences: Array<'POSP_LIFE' | 'POSP_GENERAL'> = []): Promise<{ memberId: string; token: string }> {
  const admin = `Bearer ${adminToken()}`;
  phoneCounter += 1;
  const created = await app.http.post('/api/v1/members').set('Host', HOST).set('Authorization', admin).set('Idempotency-Key', newIdempotencyKey())
    .send({ displayName: `Catalogue seller ${phoneCounter}`, phone: `+91960000${String(phoneCounter).padStart(4, '0')}`, roles: ['SALESPERSON'], salespersonType: type, orgUnitId: 'ou_root' });
  if (created.status !== 201) throw new Error(`member failed: ${created.status} ${JSON.stringify(created.body)}`);
  const memberId: string = created.body.id;
  for (const kind of licences) {
    const res = await app.http.post(`/api/v1/members/${memberId}/licences`).set('Host', HOST).set('Authorization', admin).set('Idempotency-Key', newIdempotencyKey())
      .send({ kind, number: `LIC-${kind}-${phoneCounter}`, validFrom: '2025-01-01', validTo: '2030-12-31' });
    if (res.status >= 300) throw new Error(`licence failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  await activateSeller(app, memberId, type);
  return { memberId, token: tokenFor({ tenantId: 'ten_acme', roles: ['SALESPERSON'], memberId, orgUnitId: 'ou_root' }) };
}

/**
 * Switches the tenant's distributor entity type. There is no HTTP API for this after provisioning (M01), so the
 * fixture writes through the published settings port, exactly as provisioning does.
 */
export async function setEntityType(app: TestApp, entityType: 'IMF' | 'BROKER' | 'CORPORATE_AGENT' | 'INDIVIDUAL_AGENT', tenantId = 'ten_acme'): Promise<void> {
  const settings = app.app.get<TenantSettingsRepository>(TENANT_SETTINGS_REPOSITORY);
  const uow = app.app.get<UnitOfWork>(UNIT_OF_WORK);
  await uow.run(tenantId, (tx) =>
    settings.saveEntity(tx, DistributorEntity.create({
      tenantKind: entityType === 'INDIVIDUAL_AGENT' ? 'SOLO' : 'ORGANISATION', entityType, legalName: `Acme ${entityType}`,
      registrationNo: `REG-${entityType.replace(/_/g, '-')}`, registrationValidTo: '2030-12-31', principalOfficerName: 'Test Principal Officer',
    })),
  );
}
