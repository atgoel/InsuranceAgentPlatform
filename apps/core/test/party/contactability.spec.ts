import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { PartyModule } from '../../src/modules/party/party.module';
import { AUDIT_LOG } from '../../src/kernel/tokens';
import { InMemoryAuditLog } from '../../src/kernel/audit/audit-log';
import { createTestApp, TestApp } from '../support/test-app';
import { tokenFor } from '../support/tokens';
import { newIdempotencyKey } from '../support/idempotency';

/** AC-M03-04 contactability, AC-M03-05 suppression by contact hash, AC-M03-10 scope, AC-M03-11 sensitive reads. */
describe('AC-M03-04/05/10/11 Contactability, suppression and sensitive data', () => {
  let testApp: TestApp;
  const seller = (memberId = 'member_1', orgUnitId = 'ou_root') => tokenFor({ tenantId: 'ten_acme', roles: ['SALESPERSON'], memberId, orgUnitId });
  const ops = () => tokenFor({ tenantId: 'ten_acme', roles: ['OPS'], memberId: 'member_ops', orgUnitId: 'ou_root' });
  const get = (path: string, token = seller()) => testApp.http.get(path).set('Host', 'acme.iap.test').set('Authorization', `Bearer ${token}`);
  const post = (path: string, body: object, token = seller()) =>
    testApp.http.post(path).set('Host', 'acme.iap.test').set('Authorization', `Bearer ${token}`).set('Idempotency-Key', newIdempotencyKey()).send(body);

  async function party(displayName: string, mobile: string, extra: object = {}, token = seller()): Promise<string> {
    const res = await post('/api/v1/parties', { kind: 'PERSON', displayName, contacts: [{ channel: 'MOBILE', value: mobile }], ...extra }, token);
    expect(res.status).toBe(201);
    return res.body.party.id;
  }
  const decide = async (id: string, channel: string, purpose: string) => {
    const res = await get(`/api/v1/parties/${id}/contactability?channel=${channel}&purpose=${purpose}`);
    expect(res.status).toBe(200);
    return res.body;
  };
  const consent = (id: string, granted: boolean, purpose = 'MARKETING', channel = 'WHATSAPP') =>
    post(`/api/v1/parties/${id}/consents`, { purpose, channel, granted, noticeVersion: 'n1', source: 'ASSISTED' });

  beforeEach(async () => {
    testApp = await createTestApp({ imports: [PartyModule] });
  });

  afterEach(async () => {
    await testApp.close();
  });

  it('AC-M03-04 allows SERVICE without a grant, requires a grant for MARKETING, and denies e-mail without an e-mail contact', async () => {
    const id = await party('Asha Rao', '+919812300001');
    expect(await decide(id, 'WHATSAPP', 'SERVICE')).toEqual({ allowed: true, reason: 'ok' });
    expect(await decide(id, 'WHATSAPP', 'MARKETING')).toEqual({ allowed: false, reason: 'consent_missing' });
    expect(await decide(id, 'EMAIL', 'SERVICE')).toEqual({ allowed: false, reason: 'no_contact_point' });
    expect((await consent(id, true)).status).toBe(201);
    expect(await decide(id, 'WHATSAPP', 'MARKETING')).toEqual({ allowed: true, reason: 'ok' });
  });

  it('AC-M03-04 a SERVICE withdrawal denies service messages on that channel', async () => {
    const id = await party('Asha Rao', '+919812300002');
    expect((await consent(id, false, 'SERVICE', 'SMS')).status).toBe(201);
    expect(await decide(id, 'SMS', 'SERVICE')).toMatchObject({ allowed: false, reason: 'consent_withdrawn' });
    expect(await decide(id, 'WHATSAPP', 'SERVICE')).toEqual({ allowed: true, reason: 'ok' });
  });

  it('AC-M03-05 withdrawing MARKETING suppresses the number, also for another record sharing it', async () => {
    const asha = await party('Asha Rao', '+919812300003');
    const brother = await party('Vikram Rao', '+919812300003'); // family phone: different person, same number
    expect((await consent(brother, true)).status).toBe(201);
    expect(await decide(brother, 'WHATSAPP', 'MARKETING')).toEqual({ allowed: true, reason: 'ok' });

    expect((await consent(asha, false)).status).toBe(201);

    expect(await decide(asha, 'WHATSAPP', 'MARKETING')).toEqual({ allowed: false, reason: 'suppressed', detail: { suppressionReason: 'OPT_OUT' } });
    expect(await decide(brother, 'WHATSAPP', 'MARKETING')).toEqual({ allowed: false, reason: 'suppressed', detail: { suppressionReason: 'OPT_OUT' } });
    expect(await decide(brother, 'SMS', 'MARKETING')).toEqual({ allowed: false, reason: 'consent_missing' }); // other channels unaffected
  });

  it('AC-M03-05 compliance can suppress a raw number (DND), which blocks every party holding it', async () => {
    const id = await party('Asha Rao', '+919812300004');
    const compliance = tokenFor({ tenantId: 'ten_acme', roles: ['COMPLIANCE'], memberId: 'member_c', orgUnitId: 'ou_root' });
    const res = await post('/api/v1/suppressions', { channel: 'ANY', value: '9812300004', reason: 'DND' }, compliance);
    expect(res.status).toBe(201);
    expect(JSON.stringify(res.body)).not.toContain('9812300004');
    expect(await decide(id, 'CALL', 'SERVICE')).toEqual({ allowed: false, reason: 'suppressed', detail: { suppressionReason: 'DND' } });
    expect((await post('/api/v1/suppressions', { channel: 'ANY', value: '9812300004', reason: 'DND' })).status).toBe(403); // salespeople cannot
  });

  it('AC-M03-10 search finds by mobile and PAN within the caller’s scope only', async () => {
    const id = await party('Meera Iyer', '+919812300005', { pan: 'ABCDE1234F' });
    expect((await get('/api/v1/parties?q=98123%2000005')).body.items.map((p: { id: string }) => p.id)).toEqual([id]);
    expect((await get('/api/v1/parties?q=abcde1234f')).body).toMatchObject({ kind: 'pan', items: [{ id }] });
    expect((await get('/api/v1/parties?q=9812300005', seller('member_2'))).body.items).toEqual([]);
    const manager = tokenFor({ tenantId: 'ten_acme', roles: ['BRANCH_MANAGER'], memberId: 'member_m', orgUnitId: 'ou_root' });
    expect((await get('/api/v1/parties?q=Meera', manager)).body.items.map((p: { id: string }) => p.id)).toEqual([id]);
    expect((await get(`/api/v1/parties/${id}`, seller('member_2'))).status).toBe(404);
  });

  it('AC-M03-11 views never expose DOB or PAN; the sensitive endpoint is permissioned, no-store and audited with purpose', async () => {
    const id = await party('Meera Iyer', '+919812300006', { pan: 'ABCDE1234F', dateOfBirth: '1990-04-12' });
    const view = await get(`/api/v1/parties/${id}`);
    expect(view.status).toBe(200);
    expect(view.body).toMatchObject({ dobYear: 1990, panLast4: '234F' });
    for (const secret of ['ABCDE1234F', '1990-04-12', '9812300006']) expect(JSON.stringify(view.body)).not.toContain(secret);

    expect((await get(`/api/v1/parties/${id}/sensitive?purpose=PROPOSAL`)).status).toBe(403);

    const res = await get(`/api/v1/parties/${id}/sensitive?purpose=PROPOSAL`, ops());
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toEqual({ dateOfBirth: '1990-04-12', pan: 'ABCDE1234F' });
    const audit = testApp.app.get<InMemoryAuditLog>(AUDIT_LOG).events.filter((e) => e.action === 'party.sensitive.read' && e.entityId === id);
    expect(audit).toHaveLength(1);
    expect(JSON.stringify(audit)).toContain('PROPOSAL');
    expect(JSON.stringify(audit)).not.toContain('ABCDE1234F');
    expect(JSON.stringify(testApp.logs.records)).not.toContain('ABCDE1234F');
  });
});
