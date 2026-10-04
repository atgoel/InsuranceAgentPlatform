import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { PartyModule } from '../../src/modules/party/party.module';
import { createTestApp, TestApp } from '../support/test-app';
import { customFieldOverrides } from '../support/custom-field-defs';
import { tokenFor } from '../support/tokens';
import { AUDIT_LOG, OUTBOX } from '../../src/kernel/tokens';
import { InMemoryAuditLog } from '../../src/kernel/audit/audit-log';
import { InMemoryOutbox } from '../../src/kernel/outbox/outbox';
import { newIdempotencyKey } from '../support/idempotency';

const VALUES = { segment: 'HNI', occupation: 'Architect', income_paise: 90_000_000 };

/** AC-CR001-08 (M03 part): custom fields on parties over HTTP (memory persistence). */
describe('AC-CR001-08 party custom fields', () => {
  let app: TestApp;
  const owner = () => tokenFor({ tenantId: 'ten_acme', roles: ['SALESPERSON'], memberId: 'member_1' });

  beforeEach(async () => {
    app = await createTestApp({ imports: [PartyModule], overrides: customFieldOverrides() });
  });
  afterEach(async () => {
    await app.close();
  });

  const create = (token: string, body: Record<string, unknown>) =>
    app.http
      .post('/api/v1/parties')
      .set('Host', 'acme.iap.test')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', newIdempotencyKey())
      .send({ kind: 'PERSON', displayName: 'Meera Nair', contacts: [{ channel: 'MOBILE', value: '+919876500001' }], ...body });
  const putOn = (host: string, token: string, id: string, ifMatch: string | undefined) => {
    const r = app.http.put(`/api/v1/parties/${id}/custom-fields`).set('Host', host).set('Authorization', `Bearer ${token}`);
    return ifMatch ? r.set('If-Match', ifMatch) : r;
  };
  const put = (token: string, id: string, ifMatch: string | undefined, customFields: unknown) => {
    const r = putOn('acme.iap.test', token, id, ifMatch);
    return r.send({ customFields });
  };
  const detail = (token: string, id: string, host = 'acme.iap.test') =>
    app.http.get(`/api/v1/parties/${id}`).set('Host', host).set('Authorization', `Bearer ${token}`);

  it('AC-CR001-08 POST /parties with customFields stores them; detail shows them unmasked', async () => {
    const created = await create(owner(), { customFields: VALUES });
    expect(created.status).toBe(201);
    expect(created.body.party.customFields).toEqual(VALUES);
    const res = await detail(owner(), created.body.party.id);
    expect(res.status).toBe(200);
    expect(res.body.customFields).toEqual(VALUES);
  });

  it('AC-CR001-08 a party created without customFields starts as {}', async () => {
    const created = await create(owner(), {});
    expect(created.status).toBe(201);
    expect(created.body.party.customFields).toEqual({});
  });

  it('AC-CR001-08 the list masks P2 values as ****', async () => {
    await create(owner(), { customFields: VALUES });
    const list = await app.http.get('/api/v1/parties').set('Host', 'acme.iap.test').set('Authorization', `Bearer ${owner()}`);
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].customFields).toEqual({ segment: 'HNI', occupation: 'Architect', income_paise: '****' });
    expect(JSON.stringify(list.body)).not.toContain('90000000');
  });

  it.each([
    ['unknown key', { segment: 'HNI', nickname: 'x' }, 'customFields.nickname', 'unknown_custom_field'],
    ['wrong type', { segment: 'HNI', income_paise: 'lots' }, 'customFields.income_paise', 'invalid_type'],
    ['required missing', { occupation: 'Architect' }, 'customFields.segment', 'required'],
    ['PAN in text', { segment: 'HNI', occupation: 'ABCDE1234F' }, 'customFields.occupation', 'sensitive_content'],
  ])('AC-CR001-08 PUT rejects %s with 400 invalid_custom_fields naming the field', async (_n, values, path, code) => {
    const created = await create(owner(), { customFields: VALUES });
    const res = await put(owner(), created.body.party.id, '"v2"', values);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('invalid_custom_fields');
    expect(res.body.errors).toEqual([expect.objectContaining({ path, code })]);
    expect((await detail(owner(), created.body.party.id)).body.customFields).toEqual(VALUES);
  });

  it('AC-CR001-08 POST with invalid customFields is 400 and creates no party', async () => {
    const res = await create(owner(), { customFields: { segment: 'HNI', nickname: 'x' } });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('invalid_custom_fields');
    expect(res.body.errors).toEqual([expect.objectContaining({ path: 'customFields.nickname', code: 'unknown_custom_field' })]);
    const list = await app.http.get('/api/v1/parties').set('Host', 'acme.iap.test').set('Authorization', `Bearer ${owner()}`);
    expect(list.body.items).toEqual([]);
  });

  it('AC-CR001-08 PUT replaces the set, returns the view with a new ETag and bumps the version', async () => {
    const created = await create(owner(), { customFields: VALUES });
    expect(created.body.party.version).toBe(2);
    const res = await put(owner(), created.body.party.id, '"v2"', { segment: 'RETAIL' });
    expect(res.status).toBe(200);
    expect(res.body.customFields).toEqual({ segment: 'RETAIL' });
    expect(res.body.version).toBe(3);
    expect(res.headers.etag).toBe('"v3"');
  });

  it('AC-CR001-08 PUT with a stale If-Match is 412 version_mismatch and changes nothing', async () => {
    const created = await create(owner(), { customFields: VALUES });
    const res = await put(owner(), created.body.party.id, '"v1"', { segment: 'RETAIL' });
    expect(res.status).toBe(412);
    expect(res.body.code).toBe('version_mismatch');
    expect((await detail(owner(), created.body.party.id)).body.customFields).toEqual(VALUES);
  });

  it('AC-CR001-08 PUT without If-Match is 400 if_match_required', async () => {
    const created = await create(owner(), { customFields: VALUES });
    const res = await put(owner(), created.body.party.id, undefined, { segment: 'RETAIL' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('if_match_required');
  });

  it('AC-CR001-08 PUT on an out-of-scope party is 404', async () => {
    const created = await create(owner(), { customFields: VALUES });
    const other = tokenFor({ tenantId: 'ten_acme', roles: ['SALESPERSON'], memberId: 'member_other' });
    const res = await put(other, created.body.party.id, '"v2"', { segment: 'RETAIL' });
    expect(res.status).toBe(404);
  });

  it('AC-CR001-08 values are tenant-isolated: another tenant gets 404 on read and replace', async () => {
    const created = await create(owner(), { customFields: VALUES });
    const zen = tokenFor({ tenantId: 'ten_zen', roles: ['SALESPERSON'], memberId: 'member_1' });
    expect((await detail(zen, created.body.party.id, 'zen.iap.test')).status).toBe(404);
    expect((await putOn('zen.iap.test', zen, created.body.party.id, '"v2"').send({ customFields: { segment: 'RETAIL' } })).status).toBe(
      404,
    );
  });

  it('AC-CR001-08 PUT audits keys only (party.custom_fields.replaced), never values, and emits no event', async () => {
    const created = await create(owner(), { customFields: VALUES });
    const id = created.body.party.id;
    await put(owner(), id, '"v2"', { segment: 'RETAIL', occupation: 'Doctor' });
    const audit = app.app
      .get<InMemoryAuditLog>(AUDIT_LOG)
      .events.filter((e) => e.action === 'party.custom_fields.replaced' && e.entityId === id);
    expect(audit).toHaveLength(1);
    expect(audit[0].metadata).toEqual({ keys: ['segment', 'occupation'] });
    expect(app.app.get<InMemoryOutbox>(OUTBOX).events.filter((e) => e.subject === id && e.type.includes('custom_fields'))).toEqual([]);
    expect(JSON.stringify([audit, app.logs.records])).not.toContain('Doctor');
  });
});
