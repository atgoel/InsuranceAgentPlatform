import { IntegrationGateway } from '../../src/modules/integration/application/integration-gateway';
import { IntegrationResources, IntegrationWork } from '../../src/modules/integration/application/integration-resources';
import { InMemoryOutbox } from '../../src/kernel/outbox/outbox';
import { OUTBOX } from '../../src/kernel/tokens';
import { FakeInsurerAdapter } from '../../src/modules/integration/infrastructure/adapters/fake-insurer.adapter';
import { integrationApp, principal, proposal, quote } from './app-fixtures';
describe('AC-M08 facade business rules', () => {
  let app: Awaited<ReturnType<typeof integrationApp>>;
  beforeEach(async () => {
    app = await integrationApp();
  });
  afterEach(async () => {
    await app.close();
  });
  it('AC-M08-05 commits intent before send and replays completed results without resubmission', async () => {
    const work = app.app.get(IntegrationWork);
    const original = app.adapter.submitProposal.bind(app.adapter);
    jest.spyOn(app.adapter, 'submitProposal').mockImplementation(async (ctx, input) => {
      const intent = await app.uow.run(ctx.tenantId, (tx) => work.submissions.getByKey(tx, ctx.idempotencyKey));
      expect(intent?.state).toBe('SENDING');
      return original(ctx, input);
    });
    const gateway = app.app.get(IntegrationGateway);
    const first = await gateway.submitProposal(principal, proposal, 'key');
    app.clock.advance(181 * 86400000);
    await app.uow.run(principal.tenantId, (tx) => work.submissions.purgeProposalBefore(tx, app.clock.now().toISOString()));
    expect(await gateway.submitProposal(principal, proposal, 'key')).toEqual(first);
    expect(app.adapter.calls.filter((call) => call.operation === 'SUBMIT_PROPOSAL')).toHaveLength(1);
    const stored = await app.uow.run(principal.tenantId, (tx) => work.submissions.getByKey(tx, 'key'));
    expect(stored?.proposalEnc).toBeUndefined();
    expect(stored?.state).toBe('COMPLETED');
  });
  it('AC-M08-05 uncertain send blocks repeat sends even after pin changes', async () => {
    app.adapter.scripted.set('SUBMIT_PROPOSAL', [
      {
        kind: 'unknown',
        reason: 'connection_reset'
      }
    ]);
    const gateway = app.app.get(IntegrationGateway);
    const first = await gateway.submitProposal(principal, proposal, 'uncertain');
    const resources = app.app.get(IntegrationResources);
    await app.uow.run(principal.tenantId, (tx) => resources.pins.put(tx, {
      adapterId: 'fake-insurer',
      version: '9.0.0',
      updatedAt: app.clock.now().toISOString()
    }));
    const second = await gateway.submitProposal(principal, proposal, 'uncertain');
    expect(first).toMatchObject({
      kind: 'DIRECT',
      outcome: {
        kind: 'unknown'
      }
    });
    expect(second).toMatchObject({
      kind: 'DIRECT',
      adapterVersion: '1.0.0',
      outcome: {
        kind: 'unknown'
      }
    });
    expect(app.adapter.calls).toHaveLength(1);
  });
  it('AC-M08-05 rejects changed canonical input for an existing business key', async () => {
    const gateway = app.app.get(IntegrationGateway);
    await gateway.submitProposal(principal, proposal, 'same-key');
    await expect(gateway.submitProposal(principal, {
      ...proposal,
      snapshotHash: 'different'
    }, 'same-key'))
      .rejects.toMatchObject({
      code: 'idempotency_key_reuse',
        httpStatus: 409
    });
    expect(app.adapter.calls).toHaveLength(1);
  });
  it('AC-M08-01 uncertified tenant falls back to assisted without a send intent', async () => {
    const other = {
      ...principal,
      tenantId: 'ten_zen'
    };
    const result = await app.app.get(IntegrationGateway).submitProposal(other, proposal, 'assisted');
    expect(result).toMatchObject({
      route: 'ASSISTED',
      instructions: {
        evidenceRequired: true
      },
      outcome: {
        kind: 'unknown',
        reason: 'assisted'
      }
    });
    const work = app.app.get(IntegrationWork);
    expect(await app.uow.run(other.tenantId, (tx) => work.submissions.getByKey(tx, 'assisted'))).toBeUndefined();
    expect(app.adapter.calls).toHaveLength(0);
  });
  it('AC-M08-04 retries only retryable failures and preserves the business key', async () => {
    app.adapter.scripted.set('QUOTE', [
      {
        kind: 'failure',
        retryable: true,
        code: 'dependency_unavailable',
        message: 'CANARY_PRIVATE_VALUE'
      },
      {
        kind: 'failure',
        retryable: true,
        code: 'dependency_unavailable',
        message: 'CANARY_PRIVATE_VALUE'
      },
    ]);
    const result = await app.app.get(IntegrationGateway).quote(principal, quote, 'quote-key');
    expect(result.outcome.kind).toBe('success');
    expect(app.adapter.calls.map((call) => call.key)).toEqual(['quote-key', 'quote-key', 'quote-key']);
    expect(JSON.stringify(app.logs.records)).not.toContain('CANARY_PRIVATE_VALUE');
  });
  it('AC-M08-04 stops immediately on permanent failure and unknown outcomes', async () => {
    app.adapter.scripted.set('QUOTE', [
      {
        kind: 'failure',
        retryable: false,
        code: 'dependency_unavailable',
        message: 'Private'
      }
    ]);
    expect((await app.app.get(IntegrationGateway).quote(principal, quote, 'decline')).outcome.kind).toBe('failure');
    app.adapter.scripted.set('QUOTE', [
      {
        kind: 'unknown',
        reason: 'timeout'
      }
    ]);
    expect((await app.app.get(IntegrationGateway).quote(principal, quote, 'unknown')).outcome.kind).toBe('unknown');
    expect(app.adapter.calls.map((call) => call.key)).toEqual(['decline', 'unknown']);
  });
  it('AC-M08-09 sanitizes insurer error codes and messages before persistence or logs', async () => {
    app.adapter.scripted.set('QUOTE', [
      {
        kind: 'failure',
        retryable: false,
        code: 'CANARY_PRIVATE_VALUE',
        message: 'CANARY_PRIVATE_VALUE'
      }
    ]);
    const result = await app.app.get(IntegrationGateway).quote(principal, quote, 'private-error');
    expect(result.outcome).toEqual({
      kind: 'failure',
      retryable: false,
      code: 'dependency_unavailable',
      message: 'Integration call failed'
    });
    expect(JSON.stringify(app.logs.records)).not.toContain('CANARY_PRIVATE_VALUE');
  });
  it('AC-M08-09 validates canonical input and rejects caller-supplied tenant fields', async () => {
    await expect(app.app.get(IntegrationGateway).quote(principal, {
      ...quote,
      tenantId: 'ten_zen'
    } as typeof quote, 'invalid'))
      .rejects.toMatchObject({
      httpStatus: 400
    });
    expect(app.adapter.calls).toHaveLength(0);
  });
  it('AC-M08-09 rejects unlisted payment URLs and never mutates payment state', async () => {
    app.adapter.scripted.set('PAYMENT_LINK', [
      {
        kind: 'success',
        value: {
          url: 'http://private.example/CANARY_PRIVATE_VALUE',
          expiresAt: '2027-01-01T00:00:00.000Z'
        }
      }
    ]);
    const result = await app.app.get(IntegrationGateway).paymentLink(principal, {
      schemaVersion: 'v1',
      insurerId: 'ins_fake',
      line: 'LIFE',
      proposalId: 'p',
      insurerRef: 'ref',
      amount: {
        amountPaise: 100,
        currency: 'INR'
      },
    }, 'payment');
    expect(result.outcome).toEqual({
      kind: 'failure',
      retryable: false,
      code: 'integration_url_invalid',
      message: 'Invalid integration URL'
    });
    expect(JSON.stringify(app.logs.records)).not.toContain('CANARY_PRIVATE_VALUE');
    expect(app.app.get<InMemoryOutbox>(OUTBOX).pending()).toEqual([]);
  });
});
describe('AC-M08-05 timeout late-result safety', () => {
  it('AC-M08-05 late successful submit cannot overwrite durable PENDING', async () => {
    const template = new FakeInsurerAdapter().manifest();
    template.lines.forEach((line) => line.operations.forEach((operation) => {
      if (operation.route !== 'ASSISTED')
        operation.timeoutMs = 1;
    }));
    const adapter = new FakeInsurerAdapter(template);
    adapter.latencyMs = 20;
    const app = await integrationApp(adapter);
    try {
      const result = await app.app.get(IntegrationGateway).submitProposal(principal, proposal, 'late');
      expect(result).toMatchObject({
        outcome: {
          kind: 'unknown',
          reason: 'timeout'
        }
      });
      await new Promise<void>((resolve) => setTimeout(resolve, 30));
      const work = app.app.get(IntegrationWork);
      expect((await app.uow.run(principal.tenantId, (tx) => work.submissions.getByKey(tx, 'late')))?.state).toBe('PENDING');
      expect(adapter.calls).toHaveLength(1);
    }
    finally {
      await app.close();
    }
  });
});
