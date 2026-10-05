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

const NOW_DEPS = () => ({ settings: new InMemoryTenantSettingsRepository(), uow: new InMemoryUnitOfWork(), clock: new FixedClock() });

describe('static tenant seeder multiple hosts (BUG-phone-host)', () => {
  it('BUG-phone-host registers two hosts mapped to one tenant and creates the tenant once', async () => {
    const directory = new InMemoryTenantDirectory();
    const saveSpy = jest.spyOn(directory, 'save');
    const map = {
      'localhost': { tenantId: 'ten_acme', status: 'active' as const },
      '192.168.29.100': { tenantId: 'ten_acme', status: 'active' as const },
    };
    await seedStaticTenants(map, { directory, ...NOW_DEPS() });
    expect((await directory.findByHost('localhost'))?.tenant.props.id).toBe('ten_acme');
    expect((await directory.findByHost('192.168.29.100'))?.tenant.props.id).toBe('ten_acme');
    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect((await directory.listHosts('ten_acme')).map((h) => h.host).sort()).toEqual(['192.168.29.100', 'localhost']);
  });

  it('BUG-phone-host adds a new host to an already-seeded tenant without rewriting entity or brand', async () => {
    const directory = new InMemoryTenantDirectory();
    const deps = { directory, ...NOW_DEPS() };
    await seedStaticTenants(TENANTS, { ...deps, legalName: 'First Legal Name' });
    const saveEntity = jest.spyOn(deps.settings, 'saveEntity');
    const saveBrandKit = jest.spyOn(deps.settings, 'saveBrandKit');
    const saveTenant = jest.spyOn(directory, 'save');
    const extended = { ...TENANTS, '192.168.29.100': { tenantId: 'ten_acme', status: 'active' as const } };
    await seedStaticTenants(extended, { ...deps, legalName: 'Second Legal Name' });
    expect((await directory.findByHost('192.168.29.100'))?.tenant.props.id).toBe('ten_acme');
    expect(saveEntity).not.toHaveBeenCalled();
    expect(saveBrandKit).not.toHaveBeenCalled();
    expect(saveTenant).not.toHaveBeenCalled();
    const entity = await deps.uow.run('ten_acme', (tx) => deps.settings.getEntity(tx));
    expect(entity?.legalName).toBe('First Legal Name');
  });

  it('BUG-phone-host does not add duplicate hosts when re-run with the same map', async () => {
    const directory = new InMemoryTenantDirectory();
    const deps = { directory, ...NOW_DEPS() };
    const map = {
      'localhost': { tenantId: 'ten_acme', status: 'active' as const },
      '192.168.29.100': { tenantId: 'ten_acme', status: 'active' as const },
    };
    await seedStaticTenants(map, deps);
    const addHost = jest.spyOn(directory, 'addHost');
    await seedStaticTenants(map, deps);
    expect(addHost).not.toHaveBeenCalled();
    expect(await directory.listHosts('ten_acme')).toHaveLength(2);
  });
});
