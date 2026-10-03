import { Pool } from 'pg';
import { MIGRATIONS_DIR, runMigrations } from '../../src/kernel/db/migrate';
import { FixedClock } from '../../src/kernel/domain/clock';
import { PgUnitOfWork } from '../../src/kernel/persistence/pg-unit-of-work';
import { Tracer } from '../../src/kernel/observability/tracer';
import { MetricsRegistry } from '../../src/kernel/observability/metrics';
import { AdviceRecord } from '../../src/modules/advice/domain/advice-record';
import { BiRecord } from '../../src/modules/advice/domain/benefit-illustration';
import { QuoteRequest } from '../../src/modules/advice/domain/quote';
import { PgAdviceRepository, PgBiRepository, PgCalculatorRunRepository, PgQuoteRepository } from '../../src/modules/advice/infrastructure/pg-advice.repositories';
import { adviceProps, adviceRepositoriesContract, AdviceHarness, optionProps, quoteProps } from './repositories.contract';

const run = process.env.DATABASE_URL ? describe : describe.skip;

run('AC-M06-11 Postgres advice repositories', () => {
  const owner = new Pool({ connectionString: process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL });
  const app = new Pool({ connectionString: process.env.DATABASE_URL });
  const uow = new PgUnitOfWork(app, new Tracer(new FixedClock(new Date('2026-10-03T06:00:00.000Z')), new MetricsRegistry()));
  const suffix = Date.now().toString(36);
  const tenants: string[] = [];
  let seq = 0;
  const uid = (label: string) => `${label}_${suffix}_${(seq += 1)}`;
  const repos = { advice: new PgAdviceRepository(), quotes: new PgQuoteRepository(), bi: new PgBiRepository(), runs: new PgCalculatorRunRepository() };

  type Query = (sql: string, params?: unknown[]) => Promise<Array<Record<string, unknown>> & { count: number }>;

  /** Runs `work` in one transaction with app.tenant_id set (RLS applies); rowCount is exposed as `.count`. */
  async function asTenant<T>(tenantId: string, work: (q: Query) => Promise<T>, pool: Pool = app): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query("select set_config('app.tenant_id', $1, true)", [tenantId]);
      const result = await work(async (sql, params) => {
        const res = await client.query(sql, params);
        return Object.assign(res.rows, { count: res.rowCount ?? 0 });
      });
      await client.query('commit');
      return result;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async function newTenant(): Promise<string> {
    const tenantId = uid('ten_adv');
    tenants.push(tenantId);
    await owner.query(
      `insert into tenant (id, slug, display_name, kind, status, plan_code, deployment_mode, crm_mode) values ($1, $1, $1, 'ORGANISATION', 'active', 'TEAM', 'pooled', 'twenty')`, [tenantId]);
    return tenantId;
  }

  const harness = async (): Promise<AdviceHarness> => ({ repos, run: (tenantId, work) => uow.run(tenantId, work), newTenant, uid });

  beforeAll(async () => {
    await runMigrations(owner, MIGRATIONS_DIR);
  });

  afterAll(async () => {
    // RLS is forced even for the owner: delete each tenant's rows as that tenant, children first.
    for (const tenantId of tenants) {
      await asTenant(tenantId, async (q) => {
        for (const table of ['bi_record', 'quote_option', 'quote_request', 'advice_record', 'calculator_run']) await q(`delete from ${table}`);
      }, owner);
    }
    if (tenants.length) await owner.query('delete from tenant where id = any($1)', [tenants]);
    await Promise.all([owner.end(), app.end()]);
  });

  adviceRepositoriesContract('AC-M06-11 Postgres', harness);

  describe('AC-M06-11 Postgres-only guarantees', () => {
    it('AC-M06-11 the migration created every M06 table', async () => {
      const { rows } = await owner.query<{ table_name: string }>(
        `select table_name from information_schema.tables where table_schema = 'public' and table_name in ('calculator_run','advice_record','quote_request','quote_option','bi_record') order by table_name`);

      expect(rows.map((r) => r.table_name)).toEqual(['advice_record', 'bi_record', 'calculator_run', 'quote_option', 'quote_request']);
    });

    it('AC-M06-11 a finalised advice record cannot be updated by the app role: direct SQL changes 0 rows and the repository throws', async () => {
      const tenantId = await newTenant();
      const id = uid('adv');
      const record = AdviceRecord.restore(adviceProps(id, { status: 'FINALISED', finalisedAt: '2026-10-03T06:30:00.000Z', suitabilityNotes: 'original' }));
      await uow.run(tenantId, (tx) => repos.advice.save(tx, record));

      const updated = await asTenant(tenantId, (q) => q(`update advice_record set suitability_notes = 'x' where id = $1`, [id]));
      const tampered = AdviceRecord.restore({ ...record.props, suitabilityNotes: 'tampered' });

      expect(updated.count).toBe(0);
      await expect(uow.run(tenantId, (tx) => repos.advice.save(tx, tampered))).rejects.toThrow(/row-level security/);
      const read = await uow.run(tenantId, (tx) => repos.advice.get(tx, id));
      expect(read?.props).toMatchObject({ status: 'FINALISED', suitabilityNotes: 'original', version: 2 });
    });

    it('AC-M06-11 a draft advice record can still be updated and finalised in one update', async () => {
      const tenantId = await newTenant();
      const id = uid('adv');
      const draft = AdviceRecord.restore(adviceProps(id));
      await uow.run(tenantId, (tx) => repos.advice.save(tx, draft));

      const finalised = AdviceRecord.restore({ ...draft.props, status: 'FINALISED', finalisedAt: '2026-10-03T07:00:00.000Z' });
      await uow.run(tenantId, (tx) => repos.advice.save(tx, finalised));

      const read = await uow.run(tenantId, (tx) => repos.advice.get(tx, id));
      expect(read?.props).toMatchObject({ status: 'FINALISED', finalisedAt: '2026-10-03T07:00:00.000Z', version: 3 });
    });

    describe('quote_option constraints', () => {
      const insertOption = (q: Query, at: { tenantId: string; quoteId: string }, id: string, o: { total?: number; ref?: string | null; versionId?: string } = {}) =>
        q(`insert into quote_option (id, tenant_id, quote_request_id, position, version_id, insurer_id, source, insurer_quote_ref, sum_assured_paise, premium_base_paise, premium_riders_paise,
             premium_tax_paise, premium_total_paise, premium_frequency, valid_until, captured_by, captured_at)
           values ($1, $2, $3, 0, $4, 'ins_x', 'MANUAL_PORTAL', $5, 1000, 100, 20, 3, $6, 'ANNUAL', '2026-10-31', 'mem_1', now())`,
          [id, at.tenantId, at.quoteId, o.versionId ?? 'pv_x', o.ref === undefined ? null : o.ref, o.total ?? 123]);

      async function quote(): Promise<{ tenantId: string; quoteId: string }> {
        const tenantId = await newTenant();
        const quoteId = uid('qte');
        await uow.run(tenantId, (tx) => repos.quotes.save(tx, QuoteRequest.restore(quoteProps(quoteId))));
        return { tenantId, quoteId };
      }

      it('AC-M06-11 an option whose total is not base + riders + tax is rejected by the CHECK constraint', async () => {
        const { tenantId, quoteId } = await quote();

        await expect(asTenant(tenantId, (q) => insertOption(q, { tenantId, quoteId }, uid('opt'), { total: 124 }))).rejects.toThrow(/check constraint/);
        await expect(asTenant(tenantId, async (q) => {
          await insertOption(q, { tenantId, quoteId }, uid('opt'), { total: 123 });
          return (await q('select premium_total_paise from quote_option where quote_request_id = $1', [quoteId])).length;
        })).resolves.toBe(1);
      });

      it('AC-M06-11 a duplicate (version, insurer quote ref) on a quote is rejected, including when both refs are null', async () => {
        const { tenantId, quoteId } = await quote();

        await expect(asTenant(tenantId, async (q) => {
          await insertOption(q, { tenantId, quoteId }, uid('opt'), { ref: 'REF-1' });
          await insertOption(q, { tenantId, quoteId }, uid('opt'), { ref: 'REF-1' });
        })).rejects.toThrow(/unique constraint/);
        await expect(asTenant(tenantId, async (q) => {
          await insertOption(q, { tenantId, quoteId }, uid('opt'), { ref: null });
          await insertOption(q, { tenantId, quoteId }, uid('opt'), { ref: null });
        })).rejects.toThrow(/unique constraint/);
        await expect(asTenant(tenantId, async (q) => {
          await insertOption(q, { tenantId, quoteId }, uid('opt'), { ref: 'REF-1' });
          await insertOption(q, { tenantId, quoteId }, uid('opt'), { ref: 'REF-2' });
          await insertOption(q, { tenantId, quoteId }, uid('opt'), { ref: null });
          await insertOption(q, { tenantId, quoteId }, uid('opt'), { ref: null, versionId: 'pv_y' });
          return (await q('select 1 from quote_option where quote_request_id = $1', [quoteId])).length;
        })).resolves.toBe(4);
      });

      it('AC-M06-11 the repository surfaces the duplicate rejection for two options without a quote reference', async () => {
        const { tenantId, quoteId } = await quote();
        const dup = QuoteRequest.restore(quoteProps(quoteId, {
          version: 2, options: [optionProps(uid('opt'), { insurerQuoteRef: undefined }), optionProps(uid('opt'), { insurerQuoteRef: undefined })],
        }));

        await expect(uow.run(tenantId, (tx) => repos.quotes.save(tx, dup))).rejects.toThrow(/unique constraint/);
      });
    });

    it('AC-M06-11 money round-trips as integer paise above 2^31 and validity as a plain IST date string', async () => {
      const tenantId = await newTenant();
      const id = uid('qte');
      const big = 9_000_000_000_000;
      const o = optionProps(uid('opt'), { sumAssuredPaise: big, premium: { basePaise: big, ridersPaise: 0, taxPaise: 1, totalPaise: big + 1, frequency: 'SINGLE' }, validUntil: '2026-01-01' });
      await uow.run(tenantId, (tx) => repos.quotes.save(tx, QuoteRequest.restore(quoteProps(id, { options: [o] }))));

      const read = await uow.run(tenantId, (tx) => repos.quotes.get(tx, id));

      expect(read?.props.options[0].sumAssuredPaise).toBe(big);
      expect(read?.props.options[0].premium.totalPaise).toBe(big + 1);
      expect(read?.props.options[0].validUntil).toBe('2026-01-01');
    });

    it('AC-M06-11 a bigint that is not a safe integer is refused rather than rounded', async () => {
      const tenantId = await newTenant();
      const id = uid('qte');
      const optionId = uid('opt');
      await uow.run(tenantId, (tx) => repos.quotes.save(tx, QuoteRequest.restore(quoteProps(id, { options: [optionProps(optionId)] }))));
      await asTenant(tenantId, (q) => q('update quote_option set sum_assured_paise = 9223372036854775000 where id = $1', [optionId]));

      await expect(uow.run(tenantId, (tx) => repos.quotes.get(tx, id))).rejects.toThrow('sum_assured_paise is not a safe integer amount of paise');
    });

    it('AC-M06-11 with another tenant in app.tenant_id no row of any M06 table is visible', async () => {
      const [tenantA, tenantB] = [await newTenant(), await newTenant()];
      const optionId = uid('opt');
      await uow.run(tenantA, async (tx) => {
        await repos.advice.save(tx, AdviceRecord.restore(adviceProps(uid('adv'))));
        await repos.quotes.save(tx, QuoteRequest.restore(quoteProps(uid('qte'), { options: [optionProps(optionId)] })));
        await repos.runs.add(tx, { id: uid('run'), partyId: 'pty_1', calculator: 'retirement', inputs: {}, outputs: {}, assumptionsVersion: 'a1', ranBy: 'mem_1', ranAt: '2026-10-03T06:00:00.000Z' });
      });
      await uow.run(tenantA, async (tx) => {
        await repos.bi.save(tx, BiRecord.restore({ id: uid('bi'), quoteOptionId: optionId, documentRef: 'doc_01ARZ3NDEKTSV4RRFFQ69G5FAV', insurerBiVersion: 'v1', uploadedBy: 'mem_1', uploadedAt: '2026-10-03T06:00:00.000Z', version: 1 }));
      });

      const counts = async (tenantId: string) => asTenant(tenantId, async (q) => {
        const out: Record<string, number> = {};
        for (const table of ['advice_record', 'quote_request', 'quote_option', 'bi_record', 'calculator_run']) out[table] = Number((await q(`select count(*) as n from ${table}`))[0].n);
        return out;
      });

      expect(await counts(tenantA)).toEqual({ advice_record: 1, quote_request: 1, quote_option: 1, bi_record: 1, calculator_run: 1 });
      expect(await counts(tenantB)).toEqual({ advice_record: 0, quote_request: 0, quote_option: 0, bi_record: 0, calculator_run: 0 });
    });

    it('AC-M06-11 a repository used outside a Postgres transaction fails loudly', async () => {
      await expect(repos.advice.get({ tenantId: 'ten_x', kind: 'memory' }, 'adv_x')).rejects.toThrow('Postgres repository used outside a Postgres transaction');
    });
  });
});
