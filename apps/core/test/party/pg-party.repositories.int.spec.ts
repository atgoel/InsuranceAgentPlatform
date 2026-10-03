import { Pool } from 'pg';
import { MIGRATIONS_DIR, runMigrations } from '../../src/kernel/db/migrate';
import { FixedClock } from '../../src/kernel/domain/clock';
import { PgUnitOfWork } from '../../src/kernel/persistence/pg-unit-of-work';
import { Tracer } from '../../src/kernel/observability/tracer';
import { MetricsRegistry } from '../../src/kernel/observability/metrics';
import {
  PgConsentRepository, PgDuplicateRepository, PgHouseholdRepository, PgPartyRepository, PgRoleLinkRepository, PgSuppressionRepository,
} from '../../src/modules/party/infrastructure/pg-party.repositories';
import { Party } from '../../src/modules/party/domain/party';
import { contractCipher, partyRepositoriesContract } from './repositories.contract';

const run = process.env.DATABASE_URL ? describe : describe.skip;

const owner = new Pool({ connectionString: process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL });
const app = new Pool({ connectionString: process.env.DATABASE_URL });
const clock = new FixedClock(new Date('2026-10-03T06:00:00.000Z'));
const uow = new PgUnitOfWork(app, new Tracer(clock, new MetricsRegistry()));
const suffix = Date.now().toString(36);
const tenantA = `ten_qa_${suffix}`;
const tenantB = `ten_qb_${suffix}`;
const repos = {
  party: new PgPartyRepository(), consent: new PgConsentRepository(), suppression: new PgSuppressionRepository(),
  household: new PgHouseholdRepository(), roleLinks: new PgRoleLinkRepository(), duplicates: new PgDuplicateRepository(),
};

/** AC-M03-15: the Postgres adapters behave exactly like the in-memory ones (same contract) and keep P3 values encrypted at rest. */
run('AC-M03-15 Postgres party repositories', () => {
  beforeAll(async () => {
    await runMigrations(owner, MIGRATIONS_DIR);
    for (const id of [tenantA, tenantB]) {
      await owner.query(
        `insert into tenant (id, slug, display_name, kind, status, plan_code, deployment_mode, crm_mode) values ($1, $1, $1, 'ORGANISATION', 'active', 'TEAM', 'pooled', 'twenty')`, [id]);
    }
  });

  afterAll(async () => {
    // RLS is forced even for the owner: delete each tenant's rows as that tenant, children before parents.
    for (const tenant of [tenantA, tenantB]) {
      const client = await owner.connect();
      try {
        await client.query('begin');
        await client.query("select set_config('app.tenant_id', $1, true)", [tenant]);
        for (const table of ['party_merge', 'duplicate_candidate', 'consent_record', 'suppression', 'party_role_link', 'household_member', 'household', 'contact_point']) {
          await client.query(`delete from ${table}`);
        }
        await client.query('update party set merged_into_id = null');
        await client.query('delete from party');
        await client.query('commit');
      } finally {
        client.release();
      }
    }
    await owner.query('delete from tenant where id = any($1)', [[tenantA, tenantB]]);
    await Promise.all([owner.end(), app.end()]);
  });

  partyRepositoriesContract('Postgres party repositories', async () => ({ repos, run: (tenantId, work) => uow.run(tenantId, work), tenantA, tenantB, suffix }));

  it('AC-M03-15 a raw SELECT of the party and contact rows holds ciphertext, never the P3 plaintext', async () => {
    const pan = 'QWERT9876Z';
    const dob = '1979-02-27';
    const p = Party.create({
      id: `pty_${suffix}_raw`, kind: 'PERSON', displayName: 'Raw Check', source: { kind: 'MANUAL' }, now: new Date('2026-10-02T00:00:00.000Z'),
      contactPoints: [{ channel: 'MOBILE', valueEnc: await contractCipher.encrypt(tenantA, '+919800000001'), valueHash: `hash_${suffix}_raw`, masked: '+91******0001', isPrimary: true }],
    });
    p.setSensitive({
      dateOfBirthEnc: await contractCipher.encrypt(tenantA, dob), dobYear: 1979,
      panEnc: await contractCipher.encrypt(tenantA, pan), panHash: contractCipher.hash(tenantA, pan), panLast4: pan.slice(-4),
    });
    await uow.run(tenantA, (tx) => repos.party.save(tx, p));

    const rows = await uow.run(tenantA, async (tx) => {
      if (tx.kind !== 'pg') throw new Error('expected a pg transaction');
      const party = await tx.query('select * from party where id = $1', [p.props.id]);
      const contacts = await tx.query('select * from contact_point where party_id = $1', [p.props.id]);
      return { party: party.rows, contacts: contacts.rows };
    });
    const dump = JSON.stringify(rows);
    expect(rows.party).toHaveLength(1);
    expect(dump).not.toContain(pan);
    expect(dump).not.toContain(dob);
    expect(dump).not.toContain('9800000001');
    expect(rows.party[0]).toMatchObject({ pan_last4: '876Z', dob_year: 1979 });
    expect(await contractCipher.decrypt(tenantA, String((rows.party[0] as { pan_enc: string }).pan_enc))).toBe(pan);
  });
});
