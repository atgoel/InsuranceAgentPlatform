import { FixedClock } from '../../../kernel/domain/clock';
import { InMemoryUnitOfWork } from '../../../kernel/persistence/in-memory-unit-of-work';
import { InMemoryTenantDirectory, InMemoryTenantSettingsRepository } from './in-memory-tenancy.repositories';
import { seedStaticTenants } from './static-tenant-seeder';

const TENANTS = { 'localhost': { tenantId: 'ten_acme', status: 'active' as const } };

async function seedAndReadLegalName(legalName?: string): Promise<string | undefined> {
  const settings = new InMemoryTenantSettingsRepository();
  const uow = new InMemoryUnitOfWork();
  await seedStaticTenants(TENANTS, {
    directory: new InMemoryTenantDirectory(),
    settings,
    uow,
    clock: new FixedClock(),
    legalName,
  });
  const entity = await uow.run('ten_acme', (tx) => settings.getEntity(tx));
  return entity?.legalName;
}

describe('static tenant seeder legal name (BUG-13)', () => {
  it('BUG-13 uses DEV_TENANT_LEGAL_NAME as the seeded entity legal name when set', async () => {
    expect(await seedAndReadLegalName('Sharma Insurance Marketing Firm Pvt Ltd')).toBe('Sharma Insurance Marketing Firm Pvt Ltd');
  });

  it('BUG-13 keeps the host-derived default legal name when unset', async () => {
    expect(await seedAndReadLegalName(undefined)).toBe('localhost Insurance Marketing Firm');
  });
});
