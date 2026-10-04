import { Pool } from 'pg';
import { runMigrations, MIGRATIONS_DIR } from '../../src/kernel/db/migrate';
import { BookModule } from '../../src/modules/book/book.module';
import { createTestApp, TestApp } from '../support/test-app';
import { tokenFor } from '../support/tokens';
import { newIdempotencyKey } from '../support/idempotency';
import { input } from './fixtures';

const run = process.env.DATABASE_URL ? describe : describe.skip;
run('AC-M07-14 PostgreSQL HTTP book journey', () => {
  const suffix = Date.now().toString(36);
  const tenantId = `ten_book_journey_${suffix}`;
  const host = `book-${suffix}.iap.test`;
  const token = tokenFor({ tenantId, roles: ['TENANT_ADMIN'], memberId: 'admin', orgUnitId: 'org_1' });
  const owner = new Pool({ connectionString: process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL });
  let app: TestApp;
  const boot = async () => {
    app = await createTestApp({ imports: [BookModule], config: {
      persistence: 'pg', databaseUrl: process.env.DATABASE_URL,
      platformDatabaseUrl: process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL,
      staticTenants: { [host]: { tenantId, status: 'active' } },
    } });
    app.clock.set(new Date('2026-10-03T00:00:00Z'));
  };
  const request = (method: 'get' | 'post', path: string) => {
    const result = app.http[method](`/api/v1${path}`).set('Host', host).set('Authorization', `Bearer ${token}`);
    return method === 'post' ? result.set('Idempotency-Key', newIdempotencyKey()) : result;
  };
  beforeAll(async () => { await runMigrations(owner, MIGRATIONS_DIR); await boot(); }, 30000);
  afterAll(async () => { await app?.close(); await owner.end(); });

  it('AC-M07-01 AC-M07-05 AC-M07-12 persists masked policies, payments and servicing notes across an app restart', async () => {
    const party = await request('post', '/parties').send({ kind: 'PERSON', displayName: 'Persistent Book Holder',
      contacts: [{ channel: 'MOBILE', value: '+919876500777' }] });
    expect(party.status).toBe(201);
    const policy = await request('post', '/held-policies').send(input(String(party.body.party.id)));
    expect(policy.status).toBe(201);
    expect(policy.body.policyNumber).toBe('XXXX1234');
    const paid = await request('post', `/held-policies/${policy.body.id}/payments`)
      .send({ installmentDue: '2026-10-03', paidOn: '2026-10-03' });
    expect(paid.status).toBe(200);
    expect(paid.body.nextDueDate).toBe('2026-11-30');
    const service = await request('post', `/held-policies/${policy.body.id}/servicing-requests`)
      .send({ kind: 'CLAIM', followUpOn: '2026-10-03' });
    expect(service.status).toBe(201);
    expect((await request('post', `/servicing-requests/${service.body.id}/notes`)
      .send({ text: 'Documents received' })).status).toBe(200);
    await app.close();
    await boot();
    const restored = await request('get', `/held-policies/${policy.body.id}`);
    expect(restored.status).toBe(200);
    expect(restored.body).toMatchObject({ policyNumber: 'XXXX1234', nextDueDate: '2026-11-30', source: 'MANUAL' });
    const replay = await request('post', `/held-policies/${policy.body.id}/payments`)
      .send({ installmentDue: '2026-10-03', paidOn: '2026-10-03' });
    expect(replay.status).toBe(200);
    expect(replay.body).toMatchObject({ nextDueDate: '2026-11-30', version: paid.body.version });
    const requests = await request('get', '/servicing-requests');
    expect(requests.status).toBe(200);
    expect(requests.body.items).toEqual(expect.arrayContaining([expect.objectContaining({ id: service.body.id,
      notes: expect.arrayContaining([expect.objectContaining({ text: 'Documents received' })]) })]));
    const unscoped = await owner.query('select id from held_policy where id=$1', [policy.body.id]);
    expect(unscoped.rowCount).toBe(0);
  }, 30000);
});
