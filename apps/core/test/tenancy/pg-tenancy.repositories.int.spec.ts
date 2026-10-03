import { Pool } from 'pg';
import { MIGRATIONS_DIR, runMigrations } from '../../src/kernel/db/migrate';
import { FixedClock } from '../../src/kernel/domain/clock';
import { PhoneNumber } from '../../src/kernel/domain';
import { PgUnitOfWork } from '../../src/kernel/persistence/pg-unit-of-work';
import { Tracer } from '../../src/kernel/observability/tracer';
import { MetricsRegistry } from '../../src/kernel/observability/metrics';
import { AesGcmFieldCipher } from '../../src/kernel/crypto/aes-gcm-field-cipher';
import { Tenant } from '../../src/modules/tenancy/domain/tenant';
import { DistributorEntity } from '../../src/modules/tenancy/domain/distributor-entity';
import { TieUpSet } from '../../src/modules/tenancy/domain/tie-up';
import { FeatureFlagSet } from '../../src/modules/tenancy/domain/feature-flags';
import { BrandKit } from '../../src/modules/tenancy/domain/brand-kit';
import { SoloSignup } from '../../src/modules/tenancy/domain/signup';
import {
  PgProvisioningStateRepository, PgSignupRepository, PgTenantDirectory, PgTenantSettingsRepository,
} from '../../src/modules/tenancy/infrastructure/pg-tenancy.repositories';

const run = process.env.DATABASE_URL ? describe : describe.skip;

/** AC-M01-15: the Postgres tenancy adapters round-trip every aggregate, respect versions and RLS, and never store a raw phone. */
run('AC-M01-15 Postgres tenancy repositories', () => {
  const owner = new Pool({ connectionString: process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL });
  const app = new Pool({ connectionString: process.env.DATABASE_URL });
  const clock = new FixedClock(new Date('2026-10-03T06:00:00.000Z'));
  const uow = new PgUnitOfWork(app, new Tracer(clock, new MetricsRegistry()));
  const directory = new PgTenantDirectory(app, owner);
  const settings = new PgTenantSettingsRepository();
  const cipher = new AesGcmFieldCipher(Buffer.alloc(32, 7));
  const s = Date.now().toString(36);
  const a = `ten_pa_${s}`;
  const b = `ten_pb_${s}`;
  const newTenant = (id: string) => Tenant.restore({
    id, slug: id.replace(/_/g, '-'), displayName: `Tenant ${id}`, kind: 'ORGANISATION', status: 'provisioning', planCode: 'BUSINESS', cell: 'cell-1',
    deploymentMode: 'pooled', crmMode: 'twenty', createdAt: '2026-10-01T00:00:00.000Z', version: 0,
  });

  beforeAll(async () => {
    await runMigrations(owner, MIGRATIONS_DIR);
    await directory.save(newTenant(a));
    await directory.save(newTenant(b));
  });

  afterAll(async () => {
    // RLS is forced even for the owner, so tenant rows are deleted as each tenant.
    for (const tenant of [a, b]) {
      const client = await owner.connect();
      try {
        await client.query('begin');
        await client.query("select set_config('app.tenant_id', $1, true)", [tenant]);
        for (const table of ['distributor_entity', 'tie_up', 'tenant_feature_flag', 'brand_kit', 'usage_counter']) await client.query(`delete from ${table}`);
        await client.query('commit');
      } finally {
        client.release();
      }
    }
    for (const table of ['provisioning_step', 'tenant_host']) await owner.query(`delete from ${table} where tenant_id = any($1)`, [[a, b]]);
    await owner.query('delete from solo_signup where id like $1', [`sig_${s}%`]);
    await owner.query('delete from tenant where id = any($1)', [[a, b]]);
    await Promise.all([owner.end(), app.end()]);
  });

  it('AC-M01-15 tenants round-trip and stale versions are rejected', async () => {
    const t = await directory.findById(a);
    expect(t?.props).toEqual({ ...newTenant(a).props, version: 1 });
    const first = await directory.findById(a);
    const second = await directory.findById(a);
    if (!first || !second) throw new Error('missing');
    first.activate();
    await directory.save(first);
    second.activate();
    await expect(directory.save(second)).rejects.toMatchObject({ code: 'version_mismatch' });
    expect((await directory.findBySlug(a.replace(/_/g, '-')))?.props).toMatchObject({ status: 'active', version: 2 });
  });

  it('AC-M01-15 hosts are unique and resolve to their tenant', async () => {
    await directory.addHost({ tenantId: a, host: `${s}.iap.test`, kind: 'platform_subdomain', verifiedAt: '2026-10-01T00:00:00.000Z' });
    await expect(directory.addHost({ tenantId: b, host: `${s}.iap.test`, kind: 'custom' })).rejects.toMatchObject({ code: 'host_taken' });
    expect(await directory.findByHost(`${s}.iap.test`)).toMatchObject({ tenant: { props: { id: a } }, host: { tenantId: a, kind: 'platform_subdomain', verifiedAt: '2026-10-01T00:00:00.000Z' } });
    expect(await directory.listHosts(b)).toEqual([]);
  });

  it('AC-M01-15 the directory pages with a cursor', async () => {
    const page = await directory.list({ kind: 'ORGANISATION', limit: 1 });
    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).toEqual(expect.any(String));
  });

  it('AC-M01-15 settings round-trip inside a tenant transaction and are invisible to another tenant (RLS)', async () => {
    const entity = DistributorEntity.create({ tenantKind: 'ORGANISATION', entityType: 'BROKER', legalName: 'Acme Brokers Pvt Ltd', registrationNo: 'IRDAI/DB/123', registrationValidTo: '2027-03-31', principalOfficerName: 'R. Iyer' });
    const tieUps = new TieUpSet([{ insurerId: 'ins_star', line: 'HEALTH', effectiveFrom: '2026-01-01' }, { insurerId: 'ins_hdfc_life', line: 'LIFE', effectiveFrom: '2026-01-01', effectiveTo: '2026-12-31' }]);
    const flags = FeatureFlagSet.defaults();
    flags.enable('whatsapp_api', clock.now());
    const kit = BrandKit.platformDefault();
    await uow.run(a, async (tx) => {
      await settings.saveEntity(tx, entity);
      await settings.replaceTieUps(tx, tieUps);
      await settings.saveFlags(tx, flags);
      await settings.saveBrandKit(tx, kit);
      await settings.saveUsage(tx, { metric: 'seats', period: '2026-10', used: 3, limit: 10 });
    });
    await uow.run(a, async (tx) => {
      expect((await settings.getEntity(tx))?.props).toEqual(entity.props);
      expect((await settings.getTieUps(tx)).all()).toEqual(tieUps.all()); // ordered by line, insurer
      expect((await settings.getFlags(tx)).list()).toEqual(flags.list());
      expect((await settings.getBrandKit(tx))?.props).toEqual(kit.props);
      expect(await settings.getUsage(tx, 'seats', '2026-10')).toEqual({ metric: 'seats', period: '2026-10', used: 3, limit: 10 });
    });
    await uow.run(b, async (tx) => {
      expect(await settings.getEntity(tx)).toBeUndefined();
      expect((await settings.getTieUps(tx)).all()).toEqual([]);
      expect(await settings.getUsage(tx, 'seats', '2026-10')).toBeUndefined();
    });
  });

  it('AC-M01-15 replacing tie-ups removes the old ones', async () => {
    await uow.run(a, (tx) => settings.replaceTieUps(tx, new TieUpSet([{ insurerId: 'ins_care', line: 'HEALTH', effectiveFrom: '2026-02-01' }])));
    await uow.run(a, async (tx) => expect((await settings.getTieUps(tx)).all()).toEqual([{ insurerId: 'ins_care', line: 'HEALTH', effectiveFrom: '2026-02-01' }]));
  });

  it('AC-M01-15 provisioning steps record completion and failures', async () => {
    const steps = new PgProvisioningStateRepository(owner);
    await steps.markFailed(a, 'crm_workspace', 'timeout');
    expect(await steps.completedSteps(a)).toEqual([]);
    await steps.markCompleted(a, 'identity_org');
    await steps.markCompleted(a, 'crm_workspace');
    expect((await steps.completedSteps(a)).sort()).toEqual(['crm_workspace', 'identity_org']);
  });

  it('AC-M01-15 a signup round-trips with its phone, but the database holds only ciphertext and a keyed hash', async () => {
    const signups = new PgSignupRepository(owner, cipher);
    const signup = SoloSignup.start({
      id: `sig_${s}`, phone: PhoneNumber.parse('+919876512345'), displayName: 'Asha Verma', licence: { insurerName: 'LIC', line: 'LIFE', licenceNo: 'AG-1' },
      consentNoticeVersion: 'v2', otpHash: 'h'.repeat(64), now: clock.now(),
    });
    await signups.save(signup);
    const loaded = await signups.get(`sig_${s}`);
    expect(loaded?.phone.e164).toBe('+919876512345');
    expect(loaded).toMatchObject({ displayName: 'Asha Verma', state: 'otp_sent', attempts: 0, licence: { licenceNo: 'AG-1' } });
    const raw = await owner.query('select * from solo_signup where id = $1', [`sig_${s}`]);
    expect(JSON.stringify(raw.rows)).not.toContain('9876512345');
    expect(await signups.countStartedSince('+919876512345', new Date('2000-01-01'))).toBe(1);
    expect(await signups.countStartedSince('+919876500000', new Date('2000-01-01'))).toBe(0);
  });
});
