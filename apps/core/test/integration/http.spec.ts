import { createHmac } from 'crypto';
import { integrationApp, principal, proposal, quote, adminToken } from './app-fixtures';
import { tokenFor } from '../support/tokens';
import { newIdempotencyKey } from '../support/idempotency';
import { IntegrationGateway } from '../../src/modules/integration/application/integration-gateway';
import { IntegrationWork } from '../../src/modules/integration/application/integration-resources';
import { DeadLetterWriter } from '../../src/modules/integration/application/dead-letter-writer';
import { InMemoryOutbox } from '../../src/kernel/outbox/outbox';
import { OUTBOX, AUDIT_LOG } from '../../src/kernel/tokens';
import { InMemoryAuditLog } from '../../src/kernel/audit/audit-log';
describe('AC-M08 tenant HTTP operations', () => {
  let app: Awaited<ReturnType<typeof integrationApp>>;
  beforeEach(async () => {
    app = await integrationApp();
  });
  afterEach(async () => {
    await app.close();
  });
  function request(method: 'get' | 'post' | 'put', path: string, token = adminToken()) {
    const req = app.http[method](`/api/v1/integrations${path}`).set('Host', 'acme.iap.test').set('Authorization', `Bearer ${token}`);
    return method === 'post' ? req.set('Idempotency-Key', newIdempotencyKey()) : req;
  }
  async function letter() {
    return app.uow.run(principal.tenantId, (tx) => app.app.get(DeadLetterWriter).create(tx, {
      adapterId: 'fake-insurer',
      adapterVersion: '1.0.0',
      operation: 'QUOTE',
      idempotencyKey: 'dlq-key',
      payload: {
        kind: 'OUTBOUND',
        operation: 'QUOTE',
        input: quote
      },
      attempts: 3,
      lastError: 'dependency_unavailable',
    }));
  }
  it('AC-M08-08 returns adapter cards, validates pins and persists exact certification', async () => {
    const list = await request('get', '');
    expect(list.status).toBe(200);
    expect(list.body.items.find((item: {
      adapterId: string;
    }) => item.adapterId === 'fake-insurer')).toMatchObject({
      adapterVersion: '1.0.0',
      pin: {
        version: '1.0.0'
      },
      certification: {
        status: 'PASSED'
      },
    });
    expect((await request('put', '/missing/pin').send({
      version: '1.0.0'
    })).body.code).toBe('adapter_not_found');
    expect((await request('put', '/fake-insurer/pin').send({
      version: '2.0.0'
    })).body.code).toBe('adapter_version_unavailable');
    const pin = await request('put', '/fake-insurer/pin').send({
      version: '1.0.0'
    });
    expect(pin.status).toBe(200);
    const certification = await request('post', '/fake-insurer/certifications').send({});
    expect(certification.status).toBe(200);
    expect(certification.body).toMatchObject({
      adapterId: 'fake-insurer',
      adapterVersion: '1.0.0',
      status: 'PASSED'
    });
    expect(certification.body.checks.map((check: {
      kind: string;
    }) => check.kind)).toEqual([
      'HAPPY_PATH', 'DECLINE', 'TIMEOUT', 'DUPLICATE_CALLBACK', 'SCHEMA_DRIFT',
    ]);
    expect(app.adapter.calls).toHaveLength(0);
  });
  it('AC-M08-06 enforces permissions, list validation, tenant isolation and audited detail access', async () => {
    const entry = await letter();
    const seller = tokenFor({
      tenantId: 'ten_acme',
      roles: ['SALESPERSON']
    });
    expect((await request('get', '/dead-letters', seller)).status).toBe(403);
    expect((await request('get', '/dead-letters?status=INVALID')).status).toBe(400);
    const list = await request('get', '/dead-letters?status=OPEN');
    expect(list.body.items.map((item: {
      id: string;
    }) => item.id)).toEqual([entry.id]);
    expect(JSON.stringify(list.body)).not.toContain('CANARY_PRIVATE_VALUE');
    const detail = await request('get', `/dead-letters/${entry.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body).toMatchObject({
      payloadExpired: false,
      payload: {
        kind: 'OUTBOUND',
        input: quote
      }
    });
    expect(app.app.get<InMemoryAuditLog>(AUDIT_LOG).events.filter((event) => event.action === 'integration.payload.accessed')).toHaveLength(1);
    const other = await app.http.get(`/api/v1/integrations/dead-letters/${entry.id}`).set('Host', 'zen.iap.test')
      .set('Authorization', `Bearer ${tokenFor({
      tenantId: 'ten_zen',
        roles: ['TENANT_ADMIN']
    })}`);
    expect(other.status).toBe(404);
    expect(other.body.code).toBe('dead_letter_not_found');
  });
  it('AC-M08-06 synchronous replay uses the original key and terminal entries cannot replay', async () => {
    const entry = await letter();
    const result = await request('post', `/dead-letters/${entry.id}/replay`).send({});
    expect(result.status).toBe(200);
    expect(result.body).toEqual({
      id: entry.id,
      status: 'REPLAYED',
      result: 'SUCCEEDED'
    });
    expect(app.adapter.calls.map((call) => [call.operation, call.key])).toEqual([['QUOTE', 'dlq-key']]);
    const repeat = await request('post', `/dead-letters/${entry.id}/replay`).send({});
    expect(repeat.status).toBe(409);
    expect(repeat.body.code).toBe('dead_letter_closed');
  });
  it('AC-M08-06 failed replay closes source and creates exactly one linked replacement', async () => {
    const entry = await letter();
    app.adapter.scripted.set('QUOTE', [
      {
        kind: 'failure',
        retryable: true,
        code: 'dependency_unavailable',
        message: 'CANARY_PRIVATE_VALUE'
      }
    ]);
    const result = await request('post', `/dead-letters/${entry.id}/replay`).send({});
    expect(result.status).toBe(200);
    expect(result.body.result).toBe('FAILED');
    const open = await request('get', '/dead-letters?status=OPEN');
    expect(open.body.items).toHaveLength(1);
    expect(open.body.items[0]).toMatchObject({
      id: result.body.replacementId,
      replayedFromId: entry.id,
      attempts: 1
    });
    expect(app.adapter.calls).toHaveLength(1);
  });
  it('AC-M08-06 concurrent synchronous replays have one close winner', async () => {
    const entry = await letter();
    const responses = await Promise.all([
      request('post', `/dead-letters/${entry.id}/replay`).send({}), request('post', `/dead-letters/${entry.id}/replay`).send({}),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(app.adapter.calls.every((call) => call.key === 'dlq-key')).toBe(true);
  });
  it('AC-M08-06 discard requires a reason and expiry rejects replay without an external call', async () => {
    const entry = await letter();
    const blank = await request('post', `/dead-letters/${entry.id}/discard`).send({
      reason: '   '
    });
    expect(blank.status).toBe(400);
    expect(blank.body.code).toBe('discard_reason_required');
    app.clock.advance(180 * 86400000);
    const expired = await request('post', `/dead-letters/${entry.id}/replay`).send({});
    expect(expired.status).toBe(410);
    expect(expired.body.code).toBe('integration_payload_expired');
    expect(app.adapter.calls).toHaveLength(0);
    const discarded = await request('post', `/dead-letters/${entry.id}/discard`).send({
      reason: '  resolved elsewhere  '
    });
    expect(discarded.body).toEqual({
      id: entry.id,
      status: 'DISCARDED'
    });
  });
  it('AC-M08-06 mutating POST operations require an idempotency key', async () => {
    const response = await app.http.post('/api/v1/integrations/fake-insurer/certifications').set('Host', 'acme.iap.test')
      .set('Authorization', `Bearer ${adminToken()}`).send({});
    expect(response.status).toBe(400);
    expect(app.adapter.calls).toHaveLength(0);
  });
});
describe('AC-M08-07 signed callback boundaries', () => {
  let app: Awaited<ReturnType<typeof integrationApp>>;
  beforeEach(async () => {
    app = await integrationApp();
    app.adapter.scripted.set('SUBMIT_PROPOSAL', [
      {
        kind: 'unknown',
        reason: 'timeout'
      }
    ]);
    await app.app.get(IntegrationGateway).submitProposal(principal, proposal, 'callback-key');
  });
  afterEach(async () => {
    await app.close();
  });
  function body(eventId = 'event1', occurredAt = '2026-01-01T00:00:00.000Z') {
    return JSON.stringify({
      schemaVersion: 'v1',
      eventId,
      occurredAt,
      kind: 'POLICY_STATUS',
      idempotencyKey: 'callback-key',
      status: {
        schemaVersion: 'v1',
        status: 'RECEIVED',
        insurerRef: 'CANARY_PRIVATE_VALUE',
        checkedAt: occurredAt
      }
    });
  }
  function send(raw: string, host = 'acme.iap.test', signatureOverride?: string) {
    const timestamp = String(Math.floor(app.clock.now().getTime() / 1000));
    const signature = createHmac('sha256', 'callback-test-secret').update(`${timestamp}.${raw}`).digest('hex');
    return app.http.post('/api/v1/callbacks/fake-insurer').set('Host', host).set('Content-Type', 'application/json')
      .set('x-callback-timestamp', timestamp).set('x-callback-signature', signatureOverride ?? signature).send(raw);
  }
  it('AC-M08-07 rejects bad signatures with security logs and no callback event', async () => {
    const response = await send(body(), 'acme.iap.test', '0'.repeat(64));
    expect(response.status).toBe(401);
    expect(response.body.code).toBe('callback_signature_invalid');
    expect(app.logs.byEvent('security.callback_rejected')).toHaveLength(1);
    expect(app.app.get<InMemoryOutbox>(OUTBOX).events).toHaveLength(0);
    expect(JSON.stringify(app.logs.records)).not.toContain('CANARY_PRIVATE_VALUE');
  });
  it('AC-M08-07 commits accepted callbacks once and rejects changed duplicates and stale events', async () => {
    expect((await send(body())).body).toEqual({
      status: 'accepted'
    });
    expect((await send(body())).body).toEqual({
      status: 'duplicate'
    });
    const conflict = await send(body().replace('CANARY_PRIVATE_VALUE', 'changed'));
    expect(conflict.status).toBe(409);
    expect(conflict.body.code).toBe('callback_event_conflict');
    const stale = await send(body('event2', '2025-12-31T23:59:00.000Z'));
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('callback_stale');
    const events = app.app.get<InMemoryOutbox>(OUTBOX).events;
    expect(events.map((event) => event.type)).toEqual(['integration.callback.received']);
    expect(JSON.stringify(events)).not.toContain('CANARY_PRIVATE_VALUE');
    expect(await app.uow.run('ten_zen', (tx) => app.app.get(IntegrationWork).submissions.getByKey(tx, 'callback-key'))).toBeUndefined();
  });
  it('AC-M08-07 verified schema and tenant-binding errors have no acceptance effects', async () => {
    const schema = await send(JSON.stringify({
      tenantId: 'ten_acme'
    }));
    expect(schema.status).toBe(400);
    expect(schema.body.code).toBe('callback_schema_invalid');
    const other = await send(body(), 'zen.iap.test');
    expect(other.status).toBe(404);
    expect(other.body.code).toBe('integration_submission_not_found');
    expect(app.app.get<InMemoryOutbox>(OUTBOX).events).toHaveLength(0);
  });
});
