import { Pool } from 'pg';
import { MIGRATIONS_DIR, runMigrations } from '../../src/kernel/db/migrate';

const run = process.env.DATABASE_URL ? describe : describe.skip;

/** AC-M05-09: the platform catalogue is readable but never writable by the application role. */
run('AC-M05-09 catalogue schema on Postgres', () => {
  const owner = new Pool({ connectionString: process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL });
  const app = new Pool({ connectionString: process.env.DATABASE_URL });
  const suffix = Date.now().toString(36);
  const insurerId = `ins_int_${suffix}`;
  const productId = `prd_int_${suffix}`;
  const versionId = `pv_int_${suffix}`;

  beforeAll(async () => {
    await runMigrations(owner, MIGRATIONS_DIR);
    await owner.query("insert into insurer (id, name, irdai_reg_no, lines) values ($1, 'Int Life', '999', '{LIFE}')", [insurerId]);
    await owner.query("insert into product (id, insurer_id, line, name, category) values ($1, $2, 'LIFE', 'Int Term', 'TERM')", [productId, insurerId]);
    await owner.query(
      `insert into product_version (id, product_id, insurer_id, line, uin, wording_version, pos_eligible, channels, effective_from, status)
       values ($1, $2, $3, 'LIFE', 'INT123456', 'v1', false, '{IMF,BROKER}', '2026-01-01', 'active')`,
      [versionId, productId, insurerId],
    );
  });

  afterAll(async () => {
    await owner.query('delete from product_version where id = $1', [versionId]);
    await owner.query('delete from product where id = $1', [productId]);
    await owner.query('delete from insurer where id = $1', [insurerId]);
    await Promise.all([owner.end(), app.end()]);
  });

  it('AC-M05-09 the app role reads every catalogue table', async () => {
    const { rows } = await app.query<{ id: string; status: string }>('select id, status from product_version where id = $1', [versionId]);
    expect(rows).toEqual([{ id: versionId, status: 'active' }]);
    for (const table of ['insurer', 'product', 'product_version', 'research_summary']) {
      await expect(app.query(`select count(*) from ${table}`)).resolves.toBeTruthy();
    }
  });

  it.each([
    ['insert into insurer', "insert into insurer (id, name, irdai_reg_no, lines) values ('ins_app_x', 'X', '1', '{LIFE}')", () => []],
    ['update product_version', 'update product_version set pos_eligible = true where id = $1', () => [versionId]],
    ['delete product', 'delete from product where id = $1', () => [productId]],
    ['insert research', "insert into research_summary (version_id, summary, points, source_ref, source_date, reviewed_wording_version, reviewed_at) values ($1, 's', '[]', 'r', '2026-01-01', 'v1', now())", () => [versionId]],
  ])('AC-M05-09 the app role cannot %s', async (_label: string, sql: string, params: () => string[]) => {
    await expect(app.query(sql, params())).rejects.toMatchObject({ code: '42501' });
  });

  it('AC-M05-09 UIN format and channel values are enforced by the schema', async () => {
    const insert = (uin: string, channels: string) =>
      owner.query(
        `insert into product_version (id, product_id, insurer_id, line, uin, wording_version, pos_eligible, channels, effective_from, status)
         values ($1, $2, $3, 'LIFE', $4, 'v9', false, $5, '2026-01-01', 'draft')`,
        [`${versionId}_bad`, productId, insurerId, uin, channels],
      );
    await expect(insert('bad uin', '{IMF}')).rejects.toMatchObject({ code: '23514' });
    await expect(insert('INT999999', '{AGGREGATOR}')).rejects.toMatchObject({ code: '23514' });
  });
});
