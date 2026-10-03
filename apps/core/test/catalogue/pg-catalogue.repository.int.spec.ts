import { Pool } from 'pg';
import { MIGRATIONS_DIR, runMigrations } from '../../src/kernel/db/migrate';
import { PgCatalogueRepository } from '../../src/modules/catalogue/infrastructure/pg-catalogue.repository';
import { ProductVersion } from '../../src/modules/catalogue/domain/product-version';
import { ComparisonScopeEngine } from '../../src/modules/catalogue/domain/scope-engine';

const run = process.env.DATABASE_URL ? describe : describe.skip;

/** AC-M05-09: the Postgres catalogue adapter round-trips every aggregate and is the same contract as the in-memory one. */
run('AC-M05-09 PgCatalogueRepository', () => {
  const owner = new Pool({ connectionString: process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL });
  const app = new Pool({ connectionString: process.env.DATABASE_URL });
  const repo = new PgCatalogueRepository(app, owner);
  const s = Date.now().toString(36);
  const ins = `ins_rt_${s}`;
  const prd = `prd_rt_${s}`;
  const pv = `pv_rt_${s}`;

  beforeAll(async () => {
    await runMigrations(owner, MIGRATIONS_DIR);
    await repo.saveInsurer({ id: ins, name: `Roundtrip Life ${s}`, irdaiRegNo: '999', lines: ['LIFE'], active: true });
    await repo.saveProduct({ id: prd, insurerId: ins, line: 'LIFE', name: 'Roundtrip Term', category: 'TERM' });
  });

  afterAll(async () => {
    await owner.query('delete from research_summary where version_id like $1', [`pv_rt_${s}%`]);
    await owner.query('delete from product_version where id like $1', [`pv_rt_${s}%`]);
    await owner.query('delete from product where id = $1', [prd]);
    await owner.query('delete from insurer where id = $1', [ins]);
    await Promise.all([owner.end(), app.end()]);
  });

  it('AC-M05-09 a version round-trips exactly, including dates, arrays and key facts', async () => {
    const draft = ProductVersion.draft({
      id: pv, productId: prd, insurerId: ins, line: 'LIFE', uin: 'RT1234567', wordingVersion: 'v1', posEligible: true, channels: ['IMF', 'BROKER'],
      effectiveFrom: '2026-01-01', quoteRequirements: ['dob'], keyFacts: [{ label: 'Cover to age', value: '85' }],
    });
    await repo.saveVersion(draft);
    const loaded = await repo.getVersion(pv);
    expect(loaded?.props).toEqual(draft.props);
    expect(await repo.versions({ productId: prd })).toEqual([draft.props]);
    expect(await repo.versions({ productId: prd, status: 'active' })).toEqual([]);
  });

  it('AC-M05-09 lifecycle changes persist (activate, lock, withdraw) and edits keep identity columns', async () => {
    const v = await repo.getVersion(pv);
    if (!v) throw new Error('missing');
    v.activate();
    v.lock(new Date('2026-02-01T10:00:00.000Z'));
    await repo.saveVersion(v);
    v.withdraw('2026-12-31');
    await repo.saveVersion(v);
    expect((await repo.getVersion(pv))?.props).toMatchObject({ status: 'withdrawn', effectiveTo: '2026-12-31', lockedAt: '2026-02-01T10:00:00.000Z', uin: 'RT1234567' });
  });

  it('AC-M05-09 research round-trips and an empty id list reads nothing', async () => {
    const summary = { versionId: pv, summary: 'Pure term.', points: ['Cover to 85'], sourceRef: 'Wording v1', sourceDate: '2026-01-01', reviewedWordingVersion: 'v1', reviewedAt: '2026-01-15T00:00:00.000Z' };
    await repo.saveResearch(summary);
    expect(await repo.research([pv, 'pv_missing'])).toEqual([summary]);
    expect(await repo.research([])).toEqual([]);
  });

  it('AC-M05-09 filters by insurer and line, and the scope engine works on what Postgres returns', async () => {
    expect((await repo.products({ insurerId: ins })).map((p) => p.id)).toEqual([prd]);
    expect(await repo.products({ insurerId: ins, line: 'HEALTH' })).toEqual([]);
    const v2 = ProductVersion.draft({ id: `${pv}_2`, productId: prd, insurerId: ins, line: 'LIFE', uin: 'RT7654321', wordingVersion: 'v2', posEligible: false, channels: ['IMF'], effectiveFrom: '2026-01-01', quoteRequirements: [], keyFacts: [] });
    v2.activate();
    await repo.saveVersion(v2);
    const result = new ComparisonScopeEngine().evaluate(
      { entityType: 'IMF', comparisonScope: 'TIED_INSURERS', tiedInsurerIds: { LIFE: [ins] }, salesperson: { type: 'EMPLOYEE', lines: ['LIFE'] }, date: '2026-06-01' },
      { versions: await repo.versions({ productId: prd }), insurers: await repo.insurers(), products: await repo.products() },
    );
    expect(result.versions.map((v) => v.versionId)).toEqual([`${pv}_2`]);
    expect(result.excluded).toEqual([{ versionId: pv, reason: 'not_effective' }]);
  });

  it('AC-M05-09 the reader pool (app role) cannot write, so a repository built only on it fails closed', async () => {
    const readOnly = new PgCatalogueRepository(app, app);
    await expect(readOnly.saveInsurer({ id: `${ins}_x`, name: 'X', irdaiRegNo: '1', lines: ['LIFE'], active: true })).rejects.toMatchObject({ code: '42501' });
  });
});
