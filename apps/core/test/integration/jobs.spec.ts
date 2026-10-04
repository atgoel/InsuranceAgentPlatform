import { InMemoryOutbox } from '../../src/kernel/outbox/outbox';
import { OUTBOX } from '../../src/kernel/tokens';
import { TENANT_DIRECTORY, TenantDirectory } from '../../src/modules/tenancy/application/ports';
import { Tenant } from '../../src/modules/tenancy/domain/tenant';
import { ReconciliationJob } from '../../src/modules/integration/application/reconciliation.job';
import { RetentionJob } from '../../src/modules/integration/application/retention.job';
import { IntegrationRuntime } from '../../src/modules/integration/application/integration-context';
import { RANDOM_SOURCE, RandomSource } from '../../src/modules/integration/application/ports';
import { IntegrationWork, IntegrationResources } from '../../src/modules/integration/application/integration-resources';
import { IntegrationGateway } from '../../src/modules/integration/application/integration-gateway';
import { PolicyStatusResult } from '../../src/modules/integration/domain/canonical';
import { DeadLetter, SubmissionRecord } from '../../src/modules/integration/application/ports';
import { integrationApp, principal, proposal } from './app-fixtures';

type App = Awaited<ReturnType<typeof integrationApp>>;

function tenant(id: string) {
  return Tenant.create({ id, slug: id.replace('_', '-'), displayName: id, kind: 'SOLO', planCode: 'SOLO', now: new Date(0) });
}

function pending(app: App, key: string, extra: Partial<SubmissionRecord> = {}): SubmissionRecord {
  const now = app.clock.now().toISOString();
  return {
    id: `isub_${key}`, adapterId: 'fake-insurer', adapterVersion: '1.0.0', idempotencyKey: key, inputHash: 'hash',
    statusRequest: { schemaVersion: 'v1', insurerId: 'ins_fake', line: 'LIFE' },
    state: 'PENDING', attempts: 0, nextAttemptAt: now, createdAt: now, updatedAt: now, ...extra,
  };
}

async function reserve(app: App, record: SubmissionRecord, tenantId = principal.tenantId) {
  const work = app.app.get(IntegrationWork);
  await app.uow.run(tenantId, (tx) => work.submissions.reserve(tx, record));
}

async function get(app: App, key: string) {
  return app.uow.run(principal.tenantId, (tx) => app.app.get(IntegrationWork).submissions.getByKey(tx, key));
}

function status(value: PolicyStatusResult['status'], at: string): PolicyStatusResult {
  if (value === 'NOT_FOUND') return { schemaVersion: 'v1', status: value, checkedAt: at };
  if (value !== 'ISSUED') return { schemaVersion: 'v1', status: value, insurerRef: 'private-ref', checkedAt: at };
  return {
    schemaVersion: 'v1', status: value, insurerRef: 'private-ref', checkedAt: at,
    policyNumber: 'CANARY_POLICY_PRIVATE', issuedOn: '2026-01-01', documentRef: 'doc-private',
    premium: { amountPaise: 125000, currency: 'INR' },
  };
}

describe('M08 scheduled work', () => {
  let app: App;
  beforeEach(async () => {
    app = await integrationApp();
    jest.spyOn(app.app.get<TenantDirectory>(TENANT_DIRECTORY), 'list').mockResolvedValue({ items: [tenant(principal.tenantId)] });
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await app.close();
  });

  it.each(['NOT_FOUND', 'RECEIVED', 'UNDERWRITING', 'REQUIREMENTS_PENDING', 'DECLINED', 'ISSUED'] as const)(
    'AC-M08-05 resolves authoritative %s through the original status key with a minimal event', async (value) => {
      await reserve(app, pending(app, 'uncertain'));
      const authoritative = status(value, app.clock.now().toISOString());
      app.adapter.scripted.set('GET_STATUS', [{ kind: 'success', value: authoritative }]);
      await app.app.get(ReconciliationJob).runOnce();
      const stored = await get(app, 'uncertain');
      expect(stored).toMatchObject({ state: 'COMPLETED', outcome: 'success', resultKind: 'RECONCILED' });
      const runtime = app.app.get(IntegrationRuntime);
      expect(JSON.parse(await runtime.cipher.decrypt(principal.tenantId, stored!.resultEnc!))).toMatchObject({
        kind: 'RECONCILED', reconciliationId: 'isub_uncertain', status: authoritative,
      });
      expect(app.adapter.calls).toEqual([{ operation: 'GET_STATUS', key: 'uncertain', tenantId: principal.tenantId }]);
      const events = app.app.get<InMemoryOutbox>(OUTBOX).events;
      expect(events).toHaveLength(1);
      expect(events[0].data).toEqual({ reconciliationId: 'isub_uncertain', adapterId: 'fake-insurer',
        adapterVersion: '1.0.0', idempotencyKey: 'uncertain', status: value });
      expect(JSON.stringify([events, app.logs.records])).not.toContain('CANARY_POLICY_PRIVATE');
    },
  );

  it('AC-M08-06 counts exactly three failed queries and creates one status-only dead letter', async () => {
    await reserve(app, pending(app, 'three'));
    app.adapter.scripted.set('GET_STATUS', Array.from({ length: 3 }, () => ({ kind: 'unknown' as const, reason: 'timeout' as const })));
    const job = app.app.get(ReconciliationJob);
    await job.runOnce();
    expect(await get(app, 'three')).toMatchObject({ state: 'PENDING', attempts: 1 });
    await job.runOnce();
    expect(await get(app, 'three')).toMatchObject({ state: 'PENDING', attempts: 2 });
    await job.runOnce();
    await job.runOnce();
    expect(await get(app, 'three')).toMatchObject({ state: 'DEAD_LETTER', attempts: 3 });
    expect(app.adapter.calls.map((call) => call.operation)).toEqual(['GET_STATUS', 'GET_STATUS', 'GET_STATUS']);
    const work = app.app.get(IntegrationWork);
    const page = await app.uow.run(principal.tenantId, (tx) => work.letters.list(tx, { limit: 100 }));
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({ status: 'OPEN', operation: 'GET_STATUS', attempts: 3 });
    const payload = await app.uow.run(principal.tenantId, (tx) => work.payloads.get(tx, page.items[0].payloadRef));
    const plaintext = await app.app.get(IntegrationRuntime).cipher.decrypt(principal.tenantId, payload!.payloadEnc);
    expect(JSON.parse(plaintext)).toEqual({ kind: 'SUBMISSION_STATUS', reconciliationId: 'isub_three' });
  });

  it('AC-M08-05 keeps a missing original version unresolved and never routes to the installed replacement', async () => {
    await reserve(app, pending(app, 'historical', { adapterVersion: '0.9.0' }));
    await expect(app.app.get(ReconciliationJob).runOnce()).rejects.toMatchObject({ code: 'adapter_version_unavailable' });
    expect(await get(app, 'historical')).toMatchObject({ state: 'PENDING', attempts: 0, lastError: 'adapter_version_unavailable' });
    expect(app.adapter.calls).toEqual([]);
    expect(app.app.get<InMemoryOutbox>(OUTBOX).events).toEqual([]);
  });

  it('AC-M08-05 reports a missing historical version after continuing healthy work in the same batch', async () => {
    await reserve(app, pending(app, 'a-missing', { adapterVersion: '0.9.0' }));
    await reserve(app, pending(app, 'b-healthy'));
    await expect(app.app.get(ReconciliationJob).runOnce()).rejects.toMatchObject({ code: 'adapter_version_unavailable' });
    expect(await get(app, 'a-missing')).toMatchObject({ state: 'PENDING', attempts: 0 });
    expect(await get(app, 'b-healthy')).toMatchObject({ state: 'COMPLETED' });
    expect(app.adapter.calls.map((call) => call.key)).toEqual(['b-healthy']);
  });

  it('AC-M08-05 ignores stale worker results and publishes no event after lease ownership changes', async () => {
    await reserve(app, pending(app, 'stale'));
    const original = app.adapter.getStatus.bind(app.adapter);
    jest.spyOn(app.adapter, 'getStatus').mockImplementation(async (ctx, request) => {
      const work = app.app.get(IntegrationWork);
      await app.uow.run(principal.tenantId, async (tx) => {
        const claimed = (await work.submissions.getByKey(tx, 'stale'))!;
        await work.submissions.save(tx, { ...claimed, leaseUntil: '2099-01-01T00:00:00.000Z' },
          { state: claimed.state, leaseUntil: claimed.leaseUntil });
      });
      return original(ctx, request);
    });
    await app.app.get(ReconciliationJob).runOnce();
    expect(await get(app, 'stale')).toMatchObject({ state: 'PENDING', leaseUntil: '2099-01-01T00:00:00.000Z' });
    expect(app.app.get<InMemoryOutbox>(OUTBOX).events).toEqual([]);
  });

  it('AC-M08-05 excludes future and terminal submissions and recovers a crashed send without resubmission', async () => {
    for (const state of ['COMPLETED', 'DEAD_LETTER'] as const) await reserve(app, pending(app, state, { state }));
    await reserve(app, pending(app, 'future', { nextAttemptAt: '2099-01-01T00:00:00.000Z' }));
    await reserve(app, pending(app, 'crashed', { state: 'SENDING', leaseUntil: app.clock.now().toISOString() }));
    await app.app.get(ReconciliationJob).runOnce();
    expect(app.adapter.calls).toEqual([{ operation: 'GET_STATUS', key: 'crashed', tenantId: principal.tenantId }]);
    expect(await get(app, 'crashed')).toMatchObject({ state: 'COMPLETED' });
  });

  it('AC-M08-05 prevents events and dead letters from a stale third failed query', async () => {
    await reserve(app, pending(app, 'third', { attempts: 2 }));
    const work = app.app.get(IntegrationWork);
    jest.spyOn(work.submissions, 'save').mockResolvedValueOnce(true).mockResolvedValue(false);
    app.adapter.scripted.set('GET_STATUS', [{ kind: 'unknown', reason: 'timeout' }]);
    await app.app.get(ReconciliationJob).runOnce();
    const page = await app.uow.run(principal.tenantId, (tx) => work.letters.list(tx, { limit: 100 }));
    expect(page.items).toEqual([]);
    expect(app.app.get<InMemoryOutbox>(OUTBOX).events).toEqual([]);
  });

  it.each(['HTTPS://evil.example/policy', 'ftp://evil.example/policy', 'https://user:secret@sandbox.insurer.example/policy'])(
    'AC-M08-09 rejects unsafe reconciliation document URL %s without retaining it', async (documentRef) => {
      await reserve(app, pending(app, 'unsafe'));
      const issued = status('ISSUED', app.clock.now().toISOString());
      app.adapter.scripted.set('GET_STATUS', [{ kind: 'success', value: { ...issued, documentRef } }]);
      await app.app.get(ReconciliationJob).runOnce();
      expect(await get(app, 'unsafe')).toMatchObject({ state: 'PENDING', attempts: 1, lastError: 'integration_url_invalid' });
      expect((await get(app, 'unsafe'))?.resultEnc).toBeUndefined();
      expect(JSON.stringify(app.logs.records)).not.toContain(documentRef);
    },
  );

  it('AC-M08-04/05 waits until the nonzero full-jitter next-attempt boundary', async () => {
    jest.spyOn(app.app.get<RandomSource>(RANDOM_SOURCE), 'next').mockReturnValue(0.5);
    await reserve(app, pending(app, 'jitter'));
    app.adapter.scripted.set('GET_STATUS', [{ kind: 'unknown', reason: 'timeout' }]);
    const job = app.app.get(ReconciliationJob);
    await job.runOnce();
    app.clock.advance(99);
    await job.runOnce();
    expect(app.adapter.calls).toHaveLength(1);
    app.clock.advance(1);
    await job.runOnce();
    expect(app.adapter.calls).toHaveLength(2);
    expect(await get(app, 'jitter')).toMatchObject({ state: 'COMPLETED' });
  });

  it('AC-M08-05 refreshes each queued lease before IO and skips ownership lost to another worker', async () => {
    for (const key of ['a-slow', 'b-slow', 'c-stolen', 'd-late']) await reserve(app, pending(app, key));
    const work = app.app.get(IntegrationWork);
    const original = app.adapter.getStatus.bind(app.adapter);
    jest.spyOn(app.adapter, 'getStatus').mockImplementation(async (ctx, request) => {
      const current = await get(app, request.idempotencyKey);
      expect(Date.parse(current!.leaseUntil!) - app.clock.now().getTime()).toBe(60000);
      if (request.idempotencyKey !== 'd-late') app.clock.advance(30000);
      if (request.idempotencyKey === 'b-slow') {
        await app.uow.run(principal.tenantId, (tx) => work.submissions.claimDue(tx, app.clock.now().toISOString(),
          new Date(app.clock.now().getTime() + 60000).toISOString(), 100));
      }
      return original(ctx, request);
    });
    await app.app.get(ReconciliationJob).runOnce();
    expect(app.adapter.calls.map((call) => call.key)).toEqual(['a-slow', 'b-slow']);
    expect(await get(app, 'c-stolen')).toMatchObject({ state: 'PENDING' });
    expect(await get(app, 'd-late')).toMatchObject({ state: 'PENDING' });
  });
});

describe('M08 retention job', () => {
  let app: App;
  beforeEach(async () => {
    app = await integrationApp();
    jest.spyOn(app.app.get<TenantDirectory>(TENANT_DIRECTORY), 'list').mockResolvedValue({ items: [tenant(principal.tenantId)] });
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await app.close();
  });

  it('AC-M08-06/10 passes exact 90/180-day cutoffs and callback/payload expiry to tenant-scoped stores', async () => {
    const now = app.clock.now().getTime();
    const work = app.app.get(IntegrationWork);
    const calls = jest.spyOn(app.app.get(IntegrationResources).calls, 'purgeBefore');
    const proposals = jest.spyOn(work.submissions, 'purgeProposalBefore');
    const callbacks = jest.spyOn(work.callbacks, 'purgeExpired');
    const payloads = jest.spyOn(work.payloads, 'purgeBefore');
    await app.app.get(RetentionJob).runOnce();
    const tx = { tenantId: principal.tenantId, kind: 'memory' };
    expect(calls).toHaveBeenCalledWith(tx, new Date(now - 90 * 86400000).toISOString());
    expect(proposals).toHaveBeenCalledWith(tx, new Date(now - 180 * 86400000).toISOString());
    expect(callbacks).toHaveBeenCalledWith(tx, app.clock.now().toISOString());
    expect(payloads).toHaveBeenCalledWith(tx, app.clock.now().toISOString());
  });

  it('AC-M08-05 retains terminal result replay while purging proposal ciphertext at exactly 180 days', async () => {
    const gateway = app.app.get(IntegrationGateway);
    const original = await gateway.submitProposal(principal, proposal, 'retained');
    app.clock.advance(180 * 86400000 - 1);
    await app.app.get(RetentionJob).runOnce();
    expect((await get(app, 'retained'))?.proposalEnc).toBeDefined();
    app.clock.advance(1);
    await app.app.get(RetentionJob).runOnce();
    expect((await get(app, 'retained'))?.proposalEnc).toBeUndefined();
    expect(await gateway.submitProposal(principal, proposal, 'retained')).toEqual(original);
    expect(app.adapter.calls).toHaveLength(1);
  });

  it('AC-M08-08 counts only OPEN letters across tenant pages without tenant metric labels', async () => {
    const directory = app.app.get<TenantDirectory>(TENANT_DIRECTORY);
    jest.spyOn(directory, 'list').mockResolvedValueOnce({ items: [tenant('ten_acme')], nextCursor: 'next' })
      .mockResolvedValueOnce({ items: [tenant('ten_zen')] });
    const work = app.app.get(IntegrationWork);
    for (const tenantId of ['ten_acme', 'ten_zen']) {
      for (const letterStatus of ['OPEN', 'REPLAYED', 'DISCARDED'] as const) {
        const entry: DeadLetter = {
          id: `idl_${tenantId}_${letterStatus}`, adapterId: 'fake-insurer', adapterVersion: '1.0.0', operation: 'GET_STATUS',
          idempotencyKey: 'key', payloadRef: 'absent', lastError: 'timeout', attempts: 3, ownerTeam: 'INTEGRATION_OPS',
          status: letterStatus, createdAt: app.clock.now().toISOString(), payloadExpiresAt: app.clock.now().toISOString(),
        };
        await app.uow.run(tenantId, (tx) => work.letters.save(tx, entry));
      }
    }
    await app.app.get(RetentionJob).runOnce();
    expect(app.metrics.gauge('integration_dead_letters_open', 'Open integration dead letters').get()).toBe(2);
    expect(directory.list).toHaveBeenNthCalledWith(2, { cursor: 'next', limit: 100 });
    const summaries = app.logs.byEvent('job.completed');
    expect(summaries.map((record) => [record.tenantId, record.ctx?.open])).toEqual([['ten_acme', 1], ['ten_zen', 1]]);
  });
});
