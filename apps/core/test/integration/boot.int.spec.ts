import { createHmac } from 'crypto';
import { Pool } from 'pg';
import { MIGRATIONS_DIR, runMigrations } from '../../src/kernel/db/migrate';
import { UNIT_OF_WORK } from '../../src/kernel/tokens';
import { Principal } from '../../src/kernel/tenancy/principal';
import { UnitOfWork, isPgTransaction } from '../../src/kernel/persistence/unit-of-work';
import { TENANT_DIRECTORY, TenantDirectory } from '../../src/modules/tenancy/application/ports';
import { IntegrationModule } from '../../src/modules/integration/integration.module';
import { IntegrationGateway } from '../../src/modules/integration/application/integration-gateway';
import { IntegrationWork } from '../../src/modules/integration/application/integration-resources';
import { ReconciliationJob } from '../../src/modules/integration/application/reconciliation.job';
import { DeadLetterWriter } from '../../src/modules/integration/application/dead-letter-writer';
import { RegisteredAdapters } from '../../src/modules/integration/infrastructure/adapter-registry';
import { FakeInsurerAdapter } from '../../src/modules/integration/infrastructure/adapters/fake-insurer.adapter';
import { AssistedAdapter } from '../../src/modules/integration/infrastructure/adapters/assisted.adapter';
import * as ports from '../../src/modules/integration/application/ports';
import { createTestApp, TestApp } from '../support/test-app';
import { tokenFor } from '../support/tokens';
import { newIdempotencyKey } from '../support/idempotency';
import { proposal } from './app-fixtures';

const run = process.env.DATABASE_URL ? describe : describe.skip;

run('AC-M08-05/06/07/10 PostgreSQL module boot and HTTP restart', () => {
  const owner = new Pool({ connectionString: process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL });
  const suffix = Date.now().toString(36);
  const tenantId = `ten_m08_${suffix}`;
  const host = `m08-${suffix}.iap.test`;
  const principal: Principal = { tenantId, userRef: 'admin', roles: ['TENANT_ADMIN'], realm: 'customers' };
  const token = tokenFor({ tenantId, roles: ['TENANT_ADMIN'] });
  let app: TestApp;
  let adapter: FakeInsurerAdapter;

  async function boot() {
    adapter = new FakeInsurerAdapter();
    app = await createTestApp({
      imports: [IntegrationModule],
      config: {
        persistence: 'pg',
        databaseUrl: process.env.DATABASE_URL,
        platformDatabaseUrl: process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL,
        staticTenants: { [host]: { tenantId, status: 'active' } },
      },
      overrides: [
        { token: ports.ADAPTER_REGISTRY, value: new RegisteredAdapters([new AssistedAdapter(), adapter]) },
        { token: ports.CREDENTIAL_VAULT, value: { resolve: async () => ({ callbackSecret: 'restart-secret' }) } },
        { token: ports.RANDOM_SOURCE, value: { next: () => 0 } },
        { token: ports.INSURER_URL_ALLOWLIST, value: { ins_fake: ['https://sandbox.insurer.example'] } },
      ],
    });
  }

  function request(method: 'get' | 'post' | 'put', path: string) {
    const req = app.http[method](`/api/v1/integrations${path}`).set('Host', host).set('Authorization', `Bearer ${token}`);
    return method === 'post' ? req.set('Idempotency-Key', newIdempotencyKey()) : req;
  }

  function callback(raw: string) {
    const timestamp = String(app.clock.now().getTime() / 1000);
    const signature = createHmac('sha256', 'restart-secret').update(`${timestamp}.${raw}`).digest('hex');
    return app.http.post('/api/v1/callbacks/fake-insurer')
      .set('Host', host)
      .set('Content-Type', 'application/json')
      .set('x-callback-timestamp', timestamp)
      .set('x-callback-signature', signature)
      .send(raw);
  }

  async function submitAndAcceptCallback() {
    expect((await request('put', '/fake-insurer/pin').send({ version: '1.0.0' })).status).toBe(200);
    expect((await request('post', '/fake-insurer/certifications').send({})).status).toBe(200);
    adapter.scripted.set('SUBMIT_PROPOSAL', [{ kind: 'unknown', reason: 'timeout' }]);
    const first = await app.app.get(IntegrationGateway).submitProposal(principal, proposal, 'restart-key');
    expect(first).toMatchObject({ outcome: { kind: 'unknown' } });
    const raw = JSON.stringify({
      schemaVersion: 'v1',
      eventId: 'restart-event',
      occurredAt: app.clock.now().toISOString(),
      kind: 'POLICY_STATUS',
      idempotencyKey: 'restart-key',
      status: {
        schemaVersion: 'v1',
        status: 'RECEIVED',
        insurerRef: 'CANARY_PRIVATE_VALUE',
        checkedAt: app.clock.now().toISOString(),
      },
    });
    expect((await callback(raw)).body).toEqual({ status: 'accepted' });
    return raw;
  }

  async function restartAndReconcile(raw: string) {
    await app.close();
    await boot();
    expect((await callback(raw)).body).toEqual({ status: 'duplicate' });
    const gateway = app.app.get(IntegrationGateway);
    expect(await gateway.submitProposal(principal, proposal, 'restart-key')).toMatchObject({ outcome: { kind: 'unknown' } });
    expect(adapter.calls).toEqual([]);
    const directory = app.app.get<TenantDirectory>(TENANT_DIRECTORY);
    const tenant = (await directory.findById(tenantId))!;
    jest.spyOn(directory, 'list').mockResolvedValue({ items: [tenant] });
    await app.app.get(ReconciliationJob).runOnce();
    expect(await gateway.submitProposal(principal, proposal, 'restart-key')).toMatchObject({
      kind: 'RECONCILED',
      status: { status: 'RECEIVED' },
    });
  }

  async function assertEncryptedRows() {
    const uow = app.app.get<UnitOfWork>(UNIT_OF_WORK);
    await uow.run(tenantId, async (tx) => {
      expect(isPgTransaction(tx)).toBe(true);
      if (!isPgTransaction(tx)) throw new Error('Expected PostgreSQL transaction');
      const callbacks = await tx.query<{ raw: string; canonical: string }>(
        'select raw_payload_enc as raw,canonical_payload_enc as canonical from callback_raw where event_id=$1',
        ['restart-event'],
      );
      expect(callbacks.rows).toHaveLength(1);
      expect(JSON.stringify(callbacks.rows)).not.toContain('CANARY_PRIVATE_VALUE');
      const events = await tx.query<{ data: unknown }>("select data from outbox_event where type='integration.callback.received'");
      expect(events.rows).toHaveLength(1);
      expect(JSON.stringify(events.rows)).not.toContain('CANARY_PRIVATE_VALUE');
    });
  }

  async function createStatusDeadLetter() {
    const gateway = app.app.get(IntegrationGateway);
    adapter.scripted.set('SUBMIT_PROPOSAL', [{ kind: 'unknown', reason: 'timeout' }]);
    await gateway.submitProposal(principal, proposal, 'replay-key');
    const work = app.app.get(IntegrationWork);
    const uow = app.app.get<UnitOfWork>(UNIT_OF_WORK);
    return uow.run(tenantId, async (tx) => {
      const record = (await work.submissions.getByKey(tx, 'replay-key'))!;
      await work.submissions.save(tx, { ...record, state: 'DEAD_LETTER', attempts: 3 }, { state: record.state });
      return app.app.get(DeadLetterWriter).create(tx, {
        adapterId: record.adapterId,
        adapterVersion: record.adapterVersion,
        operation: 'GET_STATUS',
        idempotencyKey: record.idempotencyKey,
        attempts: 3,
        lastError: 'timeout',
        payload: { kind: 'SUBMISSION_STATUS', reconciliationId: record.id },
      });
    });
  }

  async function assertConcurrentReplay(id: string) {
    const results = await Promise.all([
      request('post', `/dead-letters/${id}/replay`).send({}),
      request('post', `/dead-letters/${id}/replay`).send({}),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    const gateway = app.app.get(IntegrationGateway);
    expect(await gateway.submitProposal(principal, proposal, 'replay-key')).toMatchObject({ kind: 'RECONCILED' });
    expect(adapter.calls.filter((call) => call.operation === 'SUBMIT_PROPOSAL')).toHaveLength(1);
  }

  beforeAll(async () => {
    await runMigrations(owner, MIGRATIONS_DIR);
    await boot();
  });
  afterAll(async () => {
    jest.restoreAllMocks();
    await app?.close();
    await owner.end();
  });

  it('AC-M08-05/06/07/10 restores encrypted barriers, dedup, jobs and HTTP replay after a real application restart', async () => {
    const raw = await submitAndAcceptCallback();
    await restartAndReconcile(raw);
    await assertEncryptedRows();
    const entry = await createStatusDeadLetter();
    await assertConcurrentReplay(entry.id);
  }, 15000);
});
