import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { CrmModule } from '../../src/modules/crm/crm.module';
import { DistributionModule } from '../../src/modules/distribution/distribution.module';
import { AUDIT_LOG } from '../../src/kernel/tokens';
import { InMemoryAuditLog } from '../../src/kernel/audit/audit-log';
import { createTestApp, TestApp } from '../support/test-app';
import { customFieldOverrides } from '../support/custom-field-defs';
import { tokenFor } from '../support/tokens';
import { newIdempotencyKey } from '../support/idempotency';
import { setupSellerWithRouting } from './fixtures';

const HOST = 'acme.iap.test';
const LEAD_VALUES = { campaign_code: 'DIWALI26', source_note: 'Met at expo', budget_paise: 2_500_000 };
const OPP_VALUES = { rider_note: 'Critical illness rider', sum_assured_paise: 10_000_000, review_flag: true };

/** AC-CR001-08 (M04 part): custom fields on leads and opportunities over HTTP (memory persistence). */
describe('AC-CR001-08 CRM custom fields', () => {
  let t: TestApp;
  let sellerToken: string;
  let sellerId: string;
  const admin = () => tokenFor({ tenantId: 'ten_acme', roles: ['TENANT_ADMIN'], memberId: 'member_admin' });

  const post = (path: string, body: object, token = sellerToken, host = HOST) =>
    t.http.post(path).set('Host', host).set('Authorization', `Bearer ${token}`).set('Idempotency-Key', newIdempotencyKey()).send(body);
  const get = (path: string, token = sellerToken, host = HOST) => t.http.get(path).set('Host', host).set('Authorization', `Bearer ${token}`);
  const putCf = (path: string, ifMatch: string, customFields: unknown, token = sellerToken) =>
    t.http.put(path).set('Host', HOST).set('Authorization', `Bearer ${token}`).set('If-Match', ifMatch).send({ customFields });
  const capture = (mobile: string, extra: Record<string, unknown> = {}, token = sellerToken) =>
    post('/api/v1/leads', {
      fullName: 'Asha Verma', mobile, productInterest: 'TERM_LIFE', source: 'WALK_IN',
      consent: { granted: true, noticeVersion: 'v2', channels: ['CALL'], purposes: ['SERVICE'] }, ...extra,
    }, token);
  const version = async (path: string, token = sellerToken): Promise<string> => `"v${(await get(path, token)).body.version}"`;

  async function opportunity(mobile: string): Promise<string> {
    const leadId = (await capture(mobile)).body.leadId;
    await post(`/api/v1/leads/${leadId}/activities`, { kind: 'CALL', outcome: 'CONNECTED', occurredAt: new Date().toISOString() });
    await post(`/api/v1/leads/${leadId}/stage-transitions`, { to: 'CONTACTED' });
    await t.http.put(`/api/v1/leads/${leadId}/qualification`).set('Host', HOST).set('Authorization', `Bearer ${sellerToken}`)
      .send({ need: 'PROTECTION', budgetBand: 'LT_15K', timeline: 'THIS_MONTH' });
    await post(`/api/v1/leads/${leadId}/stage-transitions`, { to: 'QUALIFIED' });
    const conv = await post(`/api/v1/leads/${leadId}/conversion`, { partyChoice: 'LEAD_PARTY', productInterest: 'TERM_LIFE', expectedPremiumPaise: 50000, startStage: 'DISCOVERY' });
    expect(conv.status).toBe(201);
    return conv.body.opportunityId;
  }

  beforeEach(async () => {
    t = await createTestApp({ imports: [CrmModule, DistributionModule], overrides: customFieldOverrides() });
    const seller = await setupSellerWithRouting(t, 'member_cf');
    sellerToken = seller.token;
    sellerId = seller.memberId;
  });
  afterEach(async () => t.close());

  describe('lead capture', () => {
    it('AC-CR001-08 POST /leads with valid customFields stores them; detail shows them unmasked', async () => {
      const res = await capture('+919876500011', { customFields: LEAD_VALUES });
      expect(res.status).toBe(201);
      expect(res.body.ownerMemberId).toBe(sellerId);
      const detail = await get(`/api/v1/leads/${res.body.leadId}`);
      expect(detail.status).toBe(200);
      expect(detail.body.customFields).toEqual(LEAD_VALUES);
    });

    it('AC-CR001-08 a lead captured without customFields starts as {}', async () => {
      const res = await capture('+919876500012');
      expect((await get(`/api/v1/leads/${res.body.leadId}`)).body.customFields).toEqual({});
    });

    it('AC-CR001-08 the lead list masks P2 values as ****', async () => {
      await capture('+919876500013', { customFields: LEAD_VALUES });
      const list = await get('/api/v1/leads');
      expect(list.status).toBe(200);
      expect(list.body.items).toHaveLength(1);
      expect(list.body.items[0].customFields).toEqual({ campaign_code: 'DIWALI26', source_note: 'Met at expo', budget_paise: '****' });
      expect(JSON.stringify(list.body)).not.toContain('2500000');
    });

    it.each([
      ['unknown key', { campaign_code: 'X', nickname: 'x' }, 'customFields.nickname', 'unknown_custom_field'],
      ['wrong type', { campaign_code: 'X', budget_paise: 'lots' }, 'customFields.budget_paise', 'invalid_type'],
      ['required missing', { source_note: 'hello' }, 'customFields.campaign_code', 'required'],
      ['PAN in text', { campaign_code: 'X', source_note: 'ABCDE1234F' }, 'customFields.source_note', 'sensitive_content'],
    ])('AC-CR001-08 POST /leads rejects %s with 400 invalid_custom_fields and creates neither party nor lead', async (_n, customFields, path, code) => {
      const res = await capture('+919876500014', { customFields });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('invalid_custom_fields');
      expect(res.body.errors).toEqual([expect.objectContaining({ path, code })]);
      expect((await get('/api/v1/leads', admin())).body.items).toEqual([]);
      expect((await get('/api/v1/parties', admin())).body.items).toEqual([]);
    });

    it('AC-CR001-08 /public/leads does not accept customFields (400) and creates nothing', async () => {
      const res = await t.http.post('/api/v1/public/leads').set('Host', HOST).set('Idempotency-Key', newIdempotencyKey()).send({
        fullName: 'Public Person', mobile: '+919876500015', productInterest: 'TERM_LIFE', source: 'WEB_FORM',
        consent: { granted: true, noticeVersion: 'v2', channels: ['CALL'], purposes: ['SERVICE'] }, customFields: LEAD_VALUES,
      });
      expect(res.status).toBe(400);
      expect((await get('/api/v1/leads', admin())).body.items).toEqual([]);
    });

    it('AC-CR001-08 a deduplicated capture leaves the existing lead values unchanged', async () => {
      const first = await capture('+919876500016', { customFields: LEAD_VALUES });
      expect(first.status).toBe(201);
      const again = await capture('+919876500016', { customFields: { campaign_code: 'OTHER', source_note: 'Changed' } });
      expect(again.status).toBe(200);
      expect(again.body.deduplicated).toBe(true);
      expect(again.body.leadId).toBe(first.body.leadId);
      expect((await get(`/api/v1/leads/${first.body.leadId}`)).body.customFields).toEqual(LEAD_VALUES);
    });
  });

  describe('PUT /leads/:id/custom-fields', () => {
    it('AC-CR001-08 replaces the set, returns the detail view with a new ETag', async () => {
      const { leadId } = (await capture('+919876500021', { customFields: LEAD_VALUES })).body;
      const path = `/api/v1/leads/${leadId}`;
      const before = (await get(path)).body.version;
      const res = await putCf(`${path}/custom-fields`, `"v${before}"`, { campaign_code: 'NEWYEAR', budget_paise: 1_000_000 });
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(leadId);
      expect(res.body.customFields).toEqual({ campaign_code: 'NEWYEAR', budget_paise: 1_000_000 });
      expect(res.body.version).toBe(before + 1);
      expect(res.headers.etag).toBe(`"v${before + 1}"`);
      expect((await get(path)).body.customFields).toEqual({ campaign_code: 'NEWYEAR', budget_paise: 1_000_000 });
    });

    it('AC-CR001-08 a stale If-Match is 412 version_mismatch and changes nothing', async () => {
      const { leadId } = (await capture('+919876500022', { customFields: LEAD_VALUES })).body;
      const res = await putCf(`/api/v1/leads/${leadId}/custom-fields`, '"v1"', { campaign_code: 'NEWYEAR' });
      expect(res.status).toBe(412);
      expect(res.body.code).toBe('version_mismatch');
      expect((await get(`/api/v1/leads/${leadId}`)).body.customFields).toEqual(LEAD_VALUES);
    });

    it('AC-CR001-08 invalid values are 400 invalid_custom_fields naming the field', async () => {
      const { leadId } = (await capture('+919876500023', { customFields: LEAD_VALUES })).body;
      const path = `/api/v1/leads/${leadId}`;
      const res = await putCf(`${path}/custom-fields`, await version(path), { campaign_code: 'X', budget_paise: 12.5 });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('invalid_custom_fields');
      expect(res.body.errors).toEqual([expect.objectContaining({ path: 'customFields.budget_paise', code: 'money_not_integer' })]);
    });

    it('AC-CR001-08 an out-of-scope lead is 404', async () => {
      const { leadId } = (await capture('+919876500024', { customFields: LEAD_VALUES })).body;
      const other = tokenFor({ tenantId: 'ten_acme', roles: ['SALESPERSON'], memberId: 'member_other', orgUnitId: 'ou_other' });
      const res = await putCf(`/api/v1/leads/${leadId}/custom-fields`, '"v2"', { campaign_code: 'X' }, other);
      expect(res.status).toBe(404);
    });

    it('AC-CR001-08 values are tenant-isolated: another tenant gets 404 on read and replace', async () => {
      const { leadId } = (await capture('+919876500025', { customFields: LEAD_VALUES })).body;
      const zen = tokenFor({ tenantId: 'ten_zen', roles: ['TENANT_ADMIN'], memberId: 'member_z' });
      expect((await get(`/api/v1/leads/${leadId}`, zen, 'zen.iap.test')).status).toBe(404);
      expect((await t.http.put(`/api/v1/leads/${leadId}/custom-fields`).set('Host', 'zen.iap.test').set('Authorization', `Bearer ${zen}`).set('If-Match', '"v2"').send({ customFields: { campaign_code: 'X' } })).status).toBe(404);
    });

    it('AC-CR001-08 audits crm.custom_fields.replaced with subject and keys only, never values', async () => {
      const { leadId } = (await capture('+919876500026', { customFields: LEAD_VALUES })).body;
      const path = `/api/v1/leads/${leadId}`;
      await putCf(`${path}/custom-fields`, await version(path), { campaign_code: 'SECRETCODE', source_note: 'Private remark' });
      const audit = t.app.get<InMemoryAuditLog>(AUDIT_LOG).events.filter((e) => e.action === 'crm.custom_fields.replaced');
      expect(audit).toHaveLength(1);
      expect(audit[0].entityId).toBe(leadId);
      expect(audit[0].metadata).toEqual({ subjectType: 'lead', subjectId: leadId, keys: ['campaign_code', 'source_note'] });
      expect(JSON.stringify([audit, t.logs.records])).not.toContain('SECRETCODE');
      expect(JSON.stringify([audit, t.logs.records])).not.toContain('Private remark');
    });
  });

  describe('opportunities', () => {
    it('AC-CR001-08 GET /opportunities/:id returns customFields {} and an ETag; conversion does not copy lead values', async () => {
      const id = await opportunity('+919876500031');
      const res = await get(`/api/v1/opportunities/${id}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(id);
      expect(res.body.customFields).toEqual({});
      expect(res.headers.etag).toBe(`"v${res.body.version}"`);
    });

    it('AC-CR001-08 PUT replaces opportunity values with If-Match and GET returns them', async () => {
      const id = await opportunity('+919876500032');
      const path = `/api/v1/opportunities/${id}`;
      const before = (await get(path)).body.version;
      const res = await putCf(`${path}/custom-fields`, `"v${before}"`, OPP_VALUES);
      expect(res.status).toBe(200);
      expect(res.body.customFields).toEqual(OPP_VALUES);
      expect(res.body.version).toBe(before + 1);
      expect(res.headers.etag).toBe(`"v${before + 1}"`);
      expect((await get(path)).body.customFields).toEqual(OPP_VALUES);
    });

    it('AC-CR001-08 a stale If-Match is 412; invalid values are 400 invalid_custom_fields', async () => {
      const id = await opportunity('+919876500033');
      const path = `/api/v1/opportunities/${id}`;
      const stale = await putCf(`${path}/custom-fields`, '"v99"', OPP_VALUES);
      expect(stale.status).toBe(412);
      expect(stale.body.code).toBe('version_mismatch');
      const bad = await putCf(`${path}/custom-fields`, await version(path), { rider_note: 'ABCDE1234F' });
      expect(bad.status).toBe(400);
      expect(bad.body.code).toBe('invalid_custom_fields');
      expect(bad.body.errors).toEqual([expect.objectContaining({ path: 'customFields.rider_note', code: 'sensitive_content' })]);
      expect((await get(path)).body.customFields).toEqual({});
    });

    it('AC-CR001-08 out-of-scope and cross-tenant opportunities are 404', async () => {
      const id = await opportunity('+919876500034');
      const other = tokenFor({ tenantId: 'ten_acme', roles: ['SALESPERSON'], memberId: 'member_other', orgUnitId: 'ou_other' });
      expect((await get(`/api/v1/opportunities/${id}`, other)).status).toBe(404);
      expect((await putCf(`/api/v1/opportunities/${id}/custom-fields`, '"v2"', OPP_VALUES, other)).status).toBe(404);
      const zen = tokenFor({ tenantId: 'ten_zen', roles: ['TENANT_ADMIN'], memberId: 'member_z' });
      expect((await get(`/api/v1/opportunities/${id}`, zen, 'zen.iap.test')).status).toBe(404);
    });

    it('AC-CR001-08 the pipeline board never carries custom-field values', async () => {
      const id = await opportunity('+919876500035');
      const path = `/api/v1/opportunities/${id}`;
      await putCf(`${path}/custom-fields`, await version(path), OPP_VALUES);
      const board = await get('/api/v1/opportunities');
      expect(board.status).toBe(200);
      const items = board.body.columns.flatMap((c: { items: Array<Record<string, unknown>> }) => c.items);
      expect(items).toHaveLength(1);
      expect(items[0]).not.toHaveProperty('customFields');
      expect(JSON.stringify(board.body)).not.toContain('10000000');
    });
  });
});
