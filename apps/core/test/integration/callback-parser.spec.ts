import { createHmac } from 'crypto';
import { InMemoryOutbox } from '../../src/kernel/outbox/outbox';
import { OUTBOX } from '../../src/kernel/tokens';
import { IntegrationGateway } from '../../src/modules/integration/application/integration-gateway';
import { CallbackService } from '../../src/modules/integration/application/callback.service';
import { integrationApp, principal, proposal } from './app-fixtures';

describe('AC-M08-07 callback HTTP byte boundaries', () => {
  let app: Awaited<ReturnType<typeof integrationApp>>;
  beforeEach(async () => {
    app = await integrationApp();
    app.adapter.scripted.set('SUBMIT_PROPOSAL', [{ kind: 'unknown', reason: 'timeout' }]);
    await app.app.get(IntegrationGateway).submitProposal(principal, proposal, 'parser-key');
  });
  afterEach(async () => {
    await app.close();
  });

  function send(raw: string) {
    const timestamp = String(app.clock.now().getTime() / 1000);
    const signature = createHmac('sha256', 'callback-test-secret').update(`${timestamp}.${raw}`).digest('hex');
    return app.http.post('/api/v1/callbacks/fake-insurer').set('Host', 'acme.iap.test')
      .set('Content-Type', 'application/json').set('x-callback-timestamp', timestamp)
      .set('x-callback-signature', signature).send(raw);
  }

  it('AC-M08-07 accepts exact 1MiB signed JSON without the default 100KB parser rejecting it', async () => {
    const json = JSON.stringify({ schemaVersion: 'v1', eventId: 'big-event', occurredAt: app.clock.now().toISOString(),
      kind: 'POLICY_STATUS', idempotencyKey: 'parser-key', status: {
        schemaVersion: 'v1', status: 'NOT_FOUND', checkedAt: app.clock.now().toISOString(),
      } });
    const raw = json + ' '.repeat(1048576 - Buffer.byteLength(json));
    expect(Buffer.byteLength(raw)).toBe(1048576);
    const response = await send(raw);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'accepted' });
    expect(app.app.get<InMemoryOutbox>(OUTBOX).events).toHaveLength(1);
  });

  it('AC-M08-07 rejects one byte beyond 1MiB with the exact code and no acceptance effects', async () => {
    const response = await send(' '.repeat(1048577));
    expect(response.status).toBe(413);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.body.code).toBe('callback_too_large');
    expect(app.app.get<InMemoryOutbox>(OUTBOX).events).toEqual([]);
  });

  it('AC-M08-07 verifies the exact malformed JSON bytes before returning the schema error', async () => {
    const response = await send('{"schemaVersion":');
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('callback_schema_invalid');
    expect(app.app.get<InMemoryOutbox>(OUTBOX).events).toEqual([]);
    expect(app.logs.byEvent('security.callback_rejected')).toEqual([]);
  });

  it('AC-M08-07 never verifies altered decoding of invalid UTF-8 bytes as the original body', async () => {
    const service = app.app.get(CallbackService);
    const rawBody = Buffer.from([0x7b, 0xff, 0x7d]);
    const timestampHeader = String(app.clock.now().getTime() / 1000);
    const signatureHeader = createHmac('sha256', 'callback-test-secret')
      .update(`${timestampHeader}.${rawBody.toString('utf8')}`).digest('hex');
    await expect(service.accept({ tenantId: principal.tenantId, adapterId: 'fake-insurer', rawBody,
      timestampHeader, signatureHeader })).rejects.toMatchObject({ code: 'callback_signature_invalid' });
    expect(app.logs.byEvent('security.callback_rejected')).toHaveLength(1);
    expect(app.app.get<InMemoryOutbox>(OUTBOX).events).toEqual([]);
  });
});
