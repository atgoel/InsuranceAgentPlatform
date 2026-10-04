import { createHmac } from 'crypto';
import { RolePermissionMatrix } from '../../src/kernel/tenancy/permissions';
import { OUTBOX } from '../../src/kernel/tokens';
import { InMemoryOutbox } from '../../src/kernel/outbox/outbox';
import { InProcessEventBus } from '../../src/kernel/outbox/event-bus';
import { OutboxRelay } from '../../src/kernel/outbox/outbox-relay';
import { TENANT_DIRECTORY, TenantDirectory } from '../../src/modules/tenancy/application/ports';
import { Tenant } from '../../src/modules/tenancy/domain/tenant';
import { IntegrationModule } from '../../src/modules/integration/integration.module';
import { FakeInsurerAdapter } from '../../src/modules/integration/infrastructure/adapters/fake-insurer.adapter';
import { RegisteredAdapters } from '../../src/modules/integration/infrastructure/adapter-registry';
import { IntegrationGateway } from '../../src/modules/integration/application/integration-gateway';
import { IntegrationExecutor } from '../../src/modules/integration/application/integration-executor';
import { IntegrationRuntime } from '../../src/modules/integration/application/integration-context';
import { IntegrationWork, IntegrationResources } from '../../src/modules/integration/application/integration-resources';
import { DeadLetterWriter } from '../../src/modules/integration/application/dead-letter-writer';
import { DeadLetterService } from '../../src/modules/integration/application/dead-letter.service';
import { CallbackService } from '../../src/modules/integration/application/callback.service';
import { ProbeJob } from '../../src/modules/integration/application/probe.job';
import { IntegrationAdminService } from '../../src/modules/integration/application/integration-admin.service';
import { IntegrationRouting } from '../../src/modules/integration/application/integration-routing';
import { CanonicalQuoteResponse } from '../../src/modules/integration/domain/canonical';
import { CallOutcome } from '../../src/modules/integration/domain/outcome';
import { integrationApp, principal, proposal, quote } from './app-fixtures';

describe('M08 runtime boundaries', () => {
  let app: Awaited<ReturnType<typeof integrationApp>>;
  beforeEach(async () => {
    app = await integrationApp();
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await app.close();
  });

  it('AC-M08-01 registration requires advertised SPI methods and resolves only unambiguous versions', () => {
    const v2 = app.adapter.manifest();
    v2.adapterVersion = '2.0.0';
    const registry = new RegisteredAdapters([app.adapter, new FakeInsurerAdapter(v2)]);
    expect(registry.get('fake-insurer')).toBeUndefined();
    expect(registry.get('fake-insurer', '1.0.0')).toBe(app.adapter);
    const missing = new FakeInsurerAdapter();
    Object.assign(missing, { quote: undefined });
    expect(() => new RegisteredAdapters([missing])).toThrow('Invalid integration adapter manifest');
    Object.assign(missing, { quote: app.adapter.quote, probe: undefined });
    expect(() => new RegisteredAdapters([missing])).toThrow('Invalid integration adapter manifest');
  });

  it.each(['http://insurer.example', 'https://user:secret@insurer.example', 'https://insurer.example/path', 'not-a-url'])(
    'AC-M08-09 rejects invalid startup allowlist origin %s without echoing it', (origin) => {
      const module = new IntegrationModule(new RolePermissionMatrix(), { ins_fake: [origin] });
      expect(() => module.onModuleInit()).toThrow('Invalid insurer URL allowlist');
      expect(() => module.onModuleInit()).not.toThrow(origin);
    },
  );

  it('AC-M08-09 accepts exact HTTPS origins and missing bindings fail closed', async () => {
    const module = new IntegrationModule(new RolePermissionMatrix(), { ins_fake: ['https://sandbox.insurer.example'] });
    expect(() => module.onModuleInit()).not.toThrow();
    const resources = app.app.get(IntegrationResources);
    delete (resources.allowlist as Record<string, readonly string[]>).ins_fake;
    const result = await app.app.get(IntegrationGateway).paymentLink(principal, {
      schemaVersion: 'v1', insurerId: 'ins_fake', line: 'LIFE', proposalId: proposal.proposalId,
      insurerRef: 'ref', amount: { amountPaise: 100, currency: 'INR' },
    }, 'missing-origin');
    expect(result.outcome.kind).toBe('failure');
  });

  it.each([1, 3])('AC-M08-06 creates one async failure dead letter after exactly %s actual attempts', async (attempts) => {
    await app.close();
    const manifest = new FakeInsurerAdapter().manifest();
    for (const line of manifest.lines) {
      for (const operation of line.operations) {
        if (operation.operation === 'QUOTE') operation.mode = 'ASYNC';
      }
    }
    app = await integrationApp(new FakeInsurerAdapter(manifest));
    app.adapter.scripted.set('QUOTE', Array.from({ length: attempts }, () => ({ kind: 'failure' as const,
      retryable: attempts === 3, code: 'dependency_unavailable', message: 'CANARY_PRIVATE_VALUE' })));
    await app.app.get(IntegrationGateway).quote(principal, quote, 'async-failure');
    const page = await app.uow.run(principal.tenantId, (tx) => app.app.get(IntegrationWork).letters.list(tx, { limit: 100 }));
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({ attempts, operation: 'QUOTE', status: 'OPEN' });
    expect(app.adapter.calls).toHaveLength(attempts);
    expect(app.adapter.calls.every((call) => call.key === 'async-failure')).toBe(true);
    expect(JSON.stringify(page)).not.toContain('CANARY_PRIVATE_VALUE');
  });

  it('AC-M08-05 replays a full terminal failure after payload purge without retrying the send', async () => {
    app.adapter.scripted.set('SUBMIT_PROPOSAL', [{ kind: 'failure', retryable: false,
      code: 'dependency_unavailable', message: 'private insurer message' }]);
    const gateway = app.app.get(IntegrationGateway);
    const first = await gateway.submitProposal(principal, proposal, 'failure-key');
    await app.uow.run(principal.tenantId, (tx) => app.app.get(IntegrationWork).submissions.purgeProposalBefore(tx, app.clock.now().toISOString()));
    expect(await gateway.submitProposal(principal, proposal, 'failure-key')).toEqual(first);
    expect(first).toMatchObject({ kind: 'DIRECT', outcome: { kind: 'failure', retryable: false, code: 'dependency_unavailable' } });
    expect(app.adapter.calls).toHaveLength(1);
  });

  it('AC-M08-09 strips private fields and unknown error text from uncertain adapter outcomes', async () => {
    app.adapter.scripted.set('SUBMIT_PROPOSAL', [{ kind: 'unknown', reason: 'CANARY_PRIVATE_VALUE',
      details: 'CANARY_PRIVATE_VALUE' } as unknown as CallOutcome<unknown>]);
    const result = await app.app.get(IntegrationGateway).submitProposal(principal, proposal, 'unsafe-unknown');
    expect(result).toMatchObject({ outcome: { kind: 'unknown', reason: 'connection_reset' } });
    expect(JSON.stringify([result, app.logs.records])).not.toContain('CANARY_PRIVATE_VALUE');
  });

  it.each(['replay', 'discard'] as const)('AC-M08-06 %s never resubmits a dead-lettered unknown proposal', async (action) => {
    app.adapter.scripted.set('SUBMIT_PROPOSAL', [{ kind: 'unknown', reason: 'timeout' }]);
    const gateway = app.app.get(IntegrationGateway);
    await gateway.submitProposal(principal, proposal, 'status-only');
    const work = app.app.get(IntegrationWork);
    const entry = await app.uow.run(principal.tenantId, async (tx) => {
      const record = (await work.submissions.getByKey(tx, 'status-only'))!;
      await work.submissions.save(tx, { ...record, state: 'DEAD_LETTER', attempts: 3 }, { state: record.state });
      return app.app.get(DeadLetterWriter).create(tx, { adapterId: record.adapterId, adapterVersion: record.adapterVersion,
        operation: 'GET_STATUS', idempotencyKey: record.idempotencyKey, attempts: 3, lastError: 'timeout',
        payload: { kind: 'SUBMISSION_STATUS', reconciliationId: record.id } });
    });
    const letters = app.app.get(DeadLetterService);
    if (action === 'replay') await letters.replay(principal, entry.id);
    else await letters.discard(principal, entry.id, 'Resolved outside integration operations');
    const result = await gateway.submitProposal(principal, proposal, 'status-only');
    expect(result.kind).toBe(action === 'replay' ? 'RECONCILED' : 'DIRECT');
    const stored = await app.uow.run(principal.tenantId, (tx) => work.submissions.getByKey(tx, 'status-only'));
    expect(stored?.state).toBe(action === 'replay' ? 'COMPLETED' : 'DEAD_LETTER');
    expect(app.adapter.calls.map((call) => call.operation)).toEqual(action === 'replay'
      ? ['SUBMIT_PROPOSAL', 'GET_STATUS'] : ['SUBMIT_PROPOSAL']);
  });

  it('AC-M08-03/05 shares occupied slots across adapter versions and never invokes a timed-out queued call', async () => {
    const executor = app.app.get(IntegrationExecutor);
    const v2 = app.adapter.manifest();
    v2.adapterVersion = '2.0.0';
    const other = new FakeInsurerAdapter(v2);
    const started: string[] = [];
    const releases: Array<() => void> = [];
    const calls = Array.from({ length: 11 }, (_, index) => executor.run({
      tenantId: principal.tenantId, adapter: index === 10 ? other : app.adapter,
      operation: index === 10 ? 'SUBMIT_PROPOSAL' : 'QUOTE', route: 'API', key: `held-${index}`, timeoutMs: 20,
      invoke: async (ctx) => {
        started.push(ctx.idempotencyKey);
        await new Promise<void>((resolve) => releases.push(resolve));
        return { kind: 'success' as const, value: 'late' };
      },
    }, false));
    expect((await Promise.all(calls)).every((call) => call.outcome.kind === 'unknown')).toBe(true);
    expect(started).toHaveLength(10);
    for (const release of releases) release();
    await new Promise<void>((resolve) => setTimeout(resolve, 5));
    expect(started).toHaveLength(10);
  });

  it('AC-M08-08 probe health retains twenty samples and reports nearest-rank p95 through the tenant board', async () => {
    const tenant = Tenant.create({ id: principal.tenantId, slug: 'acme', displayName: 'Acme', kind: 'SOLO', planCode: 'SOLO', now: app.clock.now() });
    jest.spyOn(app.app.get<TenantDirectory>(TENANT_DIRECTORY), 'list').mockResolvedValue({ items: [tenant] });
    let latency = 0;
    jest.spyOn(app.adapter, 'probe').mockImplementation(async () => {
      latency += 1;
      app.clock.advance(latency);
      return { kind: 'success', value: { latencyMs: latency } };
    });
    const job = app.app.get(ProbeJob);
    for (let index = 0; index < 21; index += 1) await job.runOnce();
    const resources = app.app.get(IntegrationResources);
    const health = await app.uow.run(principal.tenantId, (tx) => resources.health.get(tx, 'fake-insurer', '1.0.0'));
    expect(health?.probes.map((probe) => probe.latencyMs)).toEqual(Array.from({ length: 20 }, (_, index) => index + 2));
    const board = await app.app.get(IntegrationAdminService).list(principal);
    expect(board.items.find((item) => item.adapterId === 'fake-insurer')?.lastProbe).toMatchObject({ latencyMs: 21, p95Ms: 20 });
    expect(app.metrics.counter('integration_calls_total', 'Integration calls', ['adapter', 'operation', 'route', 'outcome']).get()).toBe(21);
    expect(app.logs.byEvent('job.completed')).toHaveLength(21);
    expect(app.logs.byEvent('job.completed')[0]).toMatchObject({ tenantId: principal.tenantId, module: 'integration', ctx: { adapters: 1 } });
  });

  it('AC-M08-01/06 resolves repeated line blocks and chooses the API timeout ahead of FILE', async () => {
    await app.close();
    const manifest = new FakeInsurerAdapter().manifest();
    manifest.lines = [
      { line: 'LIFE', operations: [{ operation: 'QUOTE', route: 'FILE', mode: 'ASYNC', timeoutMs: 10, schemaVersions: ['v1'] }] },
      { line: 'LIFE', operations: [{ operation: 'QUOTE', route: 'API', mode: 'ASYNC', timeoutMs: 50, schemaVersions: ['v1'] }] },
    ];
    app = await integrationApp(new FakeInsurerAdapter(manifest));
    expect(app.app.get(IntegrationRouting).timeout('fake-insurer', '1.0.0', quote, 'QUOTE')).toBe(50);
    app.adapter.scripted.set('QUOTE', [{ kind: 'failure', retryable: false, code: 'dependency_unavailable', message: 'Declined' }]);
    const response = await app.app.get(IntegrationGateway).quote(principal, quote, 'split-capabilities');
    expect(response.route).toBe('API');
    const page = await app.uow.run(principal.tenantId, (tx) => app.app.get(IntegrationWork).letters.list(tx, { limit: 100 }));
    expect(page.items).toHaveLength(1);
    expect(page.items[0].attempts).toBe(1);
  });

  it('AC-M08-05/06 retains FILE routing in unknown submission replay and reconciled DLQ results', async () => {
    await app.close();
    const manifest = new FakeInsurerAdapter().manifest();
    for (const line of manifest.lines) {
      for (const operation of line.operations) operation.route = 'FILE';
    }
    app = await integrationApp(new FakeInsurerAdapter(manifest));
    app.adapter.scripted.set('SUBMIT_PROPOSAL', [{ kind: 'unknown', reason: 'timeout' }]);
    const gateway = app.app.get(IntegrationGateway);
    expect((await gateway.submitProposal(principal, proposal, 'file-status')).route).toBe('FILE');
    expect((await gateway.submitProposal(principal, proposal, 'file-status')).route).toBe('FILE');
    const work = app.app.get(IntegrationWork);
    const entry = await app.uow.run(principal.tenantId, async (tx) => {
      const record = (await work.submissions.getByKey(tx, 'file-status'))!;
      await work.submissions.save(tx, { ...record, state: 'DEAD_LETTER' }, { state: record.state });
      return app.app.get(DeadLetterWriter).create(tx, { adapterId: record.adapterId, adapterVersion: record.adapterVersion,
        operation: 'GET_STATUS', idempotencyKey: record.idempotencyKey, attempts: 3, lastError: 'timeout',
        payload: { kind: 'SUBMISSION_STATUS', reconciliationId: record.id } });
    });
    await app.app.get(DeadLetterService).replay(principal, entry.id);
    expect(await gateway.submitProposal(principal, proposal, 'file-status')).toMatchObject({ kind: 'RECONCILED', route: 'FILE' });
    expect(app.metrics.counter('integration_calls_total', 'Integration calls', ['adapter', 'operation', 'route', 'outcome'])
      .get({ adapter: 'fake-insurer', operation: 'GET_STATUS', route: 'FILE', outcome: 'success' })).toBe(1);
  });

  it.each(['ftp://private.example/CANARY_PRIVATE_VALUE', 'HTTPS://private.example/CANARY_PRIVATE_VALUE'])(
    'AC-M08-09 rejects unsafe benefit illustration document URL %s', async (benefitIllustrationRef) => {
      const value: CanonicalQuoteResponse = { schemaVersion: 'v1', insurerQuoteRef: 'quote-ref',
        premium: { amountPaise: 100, currency: 'INR' }, validUntil: '2027-01-01T00:00:00.000Z', benefitIllustrationRef };
      app.adapter.scripted.set('QUOTE', [{ kind: 'success', value }]);
      const result = await app.app.get(IntegrationGateway).quote(principal, quote, 'unsafe-document');
      expect(result.outcome).toMatchObject({ kind: 'failure', retryable: false, code: 'integration_url_invalid' });
      expect(JSON.stringify([result, app.logs.records])).not.toContain('CANARY_PRIVATE_VALUE');
    },
  );

  it('AC-M08-07 retries a failing callback consumer three times without accepting the callback again', async () => {
    app.adapter.scripted.set('SUBMIT_PROPOSAL', [{ kind: 'unknown', reason: 'timeout' }]);
    await app.app.get(IntegrationGateway).submitProposal(principal, proposal, 'consumer-key');
    const raw = JSON.stringify({ schemaVersion: 'v1', eventId: 'consumer-event', occurredAt: app.clock.now().toISOString(),
      kind: 'POLICY_STATUS', idempotencyKey: 'consumer-key', status: {
        schemaVersion: 'v1', status: 'NOT_FOUND', checkedAt: app.clock.now().toISOString(),
      } });
    const timestamp = String(app.clock.now().getTime() / 1000);
    const input = { tenantId: principal.tenantId, adapterId: 'fake-insurer', rawBody: Buffer.from(raw), timestampHeader: timestamp,
      signatureHeader: createHmac('sha256', 'callback-test-secret').update(`${timestamp}.${raw}`).digest('hex') };
    const service = app.app.get(CallbackService);
    expect(await service.accept(input)).toEqual({ status: 'accepted' });
    const source = app.app.get<InMemoryOutbox>(OUTBOX);
    const bus = new InProcessEventBus();
    let attempts = 0;
    bus.subscribe('integration.callback.received', async () => {
      attempts += 1;
      throw new Error('Consumer temporarily unavailable');
    }, 'failing-m09-consumer');
    const runtime = app.app.get(IntegrationRuntime);
    const relay = new OutboxRelay({ source, bus, logger: runtime.logger, metrics: runtime.metrics });
    expect((await relay.relayOnce()).failed).toBe(1);
    expect((await relay.relayOnce()).failed).toBe(1);
    expect((await relay.relayOnce()).deadLettered).toBe(1);
    await relay.relayOnce();
    expect(attempts).toBe(3);
    expect(await service.accept(input)).toEqual({ status: 'duplicate' });
    expect(source.events).toHaveLength(1);
    expect(source.deadLettered()).toHaveLength(1);
  });
});
