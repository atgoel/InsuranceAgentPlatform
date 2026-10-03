import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { CatalogueModule } from '../../src/modules/catalogue/catalogue.module';
import { AUDIT_LOG, EVENT_BUS, OUTBOX } from '../../src/kernel/tokens';
import { EventBus } from '../../src/kernel/outbox/event-bus';
import { InMemoryAuditLog } from '../../src/kernel/audit/audit-log';
import { InMemoryOutbox } from '../../src/kernel/outbox/outbox';
import { createTestApp, TestApp } from '../support/test-app';
import { operatorToken, tokenFor } from '../support/tokens';
import { newIdempotencyKey } from '../support/idempotency';
import { HOST, adminToken, tieUps } from './fixtures';

interface Row { versionId: string; inScope: boolean; exclusion?: string; status: string }

const DRAFT = {
  productId: 'prd_star_floater', uin: 'SHAHLIP26001V022526', wordingVersion: 'v2', posEligible: true, channels: ['IMF', 'BROKER'],
  effectiveFrom: '2025-10-01', keyFacts: [{ label: 'Restoration', value: '100% once a year' }],
};

/** AC-M05-01 version lifecycle and locking; AC-M05-07 operator-only administration, audited, lock on first quote. */
describe('AC-M05-01/07 Catalogue administration over HTTP', () => {
  let t: TestApp;
  const op = () => `Bearer ${operatorToken()}`;
  const opPost = (path: string, body: object = {}) => t.http.post(`/api/v1/ops/catalogue${path}`).set('Authorization', op()).set('Idempotency-Key', newIdempotencyKey()).send(body);
  const opPut = (path: string, body: object) => t.http.put(`/api/v1/ops/catalogue${path}`).set('Authorization', op()).send(body);
  const rows = async (): Promise<Row[]> => (await t.http.get('/api/v1/catalogue/products?line=HEALTH').set('Host', HOST).set('Authorization', `Bearer ${adminToken()}`)).body.items as Row[];
  const draft = async (body: object = DRAFT): Promise<string> => {
    const res = await opPost('/versions', body);
    expect(res.status).toBe(201);
    return res.body.id as string;
  };
  const quoteOptionCreated = (versionId: string, id = 'evt_quote_1') =>
    t.app.get<EventBus>(EVENT_BUS).publish({
      id, specVersion: '1.0', type: 'quote.option.created', source: 'advice', subject: 'qr_1', tenantId: 'ten_acme',
      occurredAt: '2026-01-01T00:00:00.000Z', dataVersion: 1, data: { quoteRequestId: 'qr_1', optionId: 'qo_1', versionId },
    });

  beforeEach(async () => {
    t = await createTestApp({ imports: [CatalogueModule] });
    await tieUps(t, [['ins_star', 'HEALTH']]);
  });
  afterEach(async () => t.close());

  describe('Lifecycle', () => {
    it('AC-M05-01 a draft is created with insurer and line from its product and stays out of the tenant table until activated', async () => {
      const res = await opPost('/versions', DRAFT);
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ productId: 'prd_star_floater', insurerId: 'ins_star', line: 'HEALTH', status: 'draft', wordingVersion: 'v2' });
      expect(res.body.lockedAt).toBeUndefined();
      expect((await rows()).some((r) => r.versionId === res.body.id)).toBe(false);
    });

    it('AC-M05-01 activation puts the version in scope; withdrawal takes it out as not_effective', async () => {
      const id = await draft();
      const activated = await opPost(`/versions/${id}/activation`);
      expect([activated.status, activated.body.status]).toEqual([200, 'active']);
      expect((await rows()).find((r) => r.versionId === id)).toMatchObject({ inScope: true, status: 'active' });

      const withdrawn = await opPost(`/versions/${id}/withdrawal`, { on: '2025-12-31' });
      expect(withdrawn.status).toBe(200);
      expect(withdrawn.body).toMatchObject({ status: 'withdrawn', effectiveTo: '2025-12-31' });
      expect((await rows()).find((r) => r.versionId === id)).toMatchObject({ inScope: false, exclusion: 'not_effective', status: 'withdrawn' });
    });

    it('AC-M05-01 a version effective in the future is active but not yet in scope', async () => {
      const id = await draft({ ...DRAFT, effectiveFrom: '2026-02-01' });
      await opPost(`/versions/${id}/activation`).expect(200);
      expect((await rows()).find((r) => r.versionId === id)).toMatchObject({ inScope: false, exclusion: 'not_effective' });
    });

    it('AC-M05-01 an unlocked version can be edited', async () => {
      const id = await draft();
      const res = await opPut(`/versions/${id}`, { posEligible: false, keyFacts: [{ label: 'Room rent', value: 'No cap' }] });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ posEligible: false, keyFacts: [{ label: 'Room rent', value: 'No cap' }] });
    });
  });

  describe('Locking on first quote (M06 event)', () => {
    it('AC-M05-07 quote.option.created locks the version; later edits are 422 product_version_locked; withdrawal still works', async () => {
      const id = await draft();
      await opPost(`/versions/${id}/activation`).expect(200);
      await quoteOptionCreated(id);
      const edit = await opPut(`/versions/${id}`, { posEligible: false });
      expect(edit.status).toBe(422);
      expect(edit.body.code).toBe('product_version_locked');
      expect((await opPost(`/versions/${id}/withdrawal`)).status).toBe(200);
    });

    it('AC-M05-07 a redelivered event locks once (inbox) and audits once', async () => {
      const id = await draft();
      await quoteOptionCreated(id, 'evt_dup');
      await quoteOptionCreated(id, 'evt_dup');
      await quoteOptionCreated(id, 'evt_other');
      const locks = t.app.get<InMemoryAuditLog>(AUDIT_LOG).events.filter((e) => e.action === 'catalogue.version.locked' && e.entityId === id);
      expect(locks).toHaveLength(1);
    });
  });

  describe('Operator-only access', () => {
    it.each([
      ['PUT', '/insurers'], ['PUT', '/products'], ['POST', '/versions'], ['POST', '/versions/pv_star_floater_v1/activation'],
      ['POST', '/versions/pv_star_floater_v1/withdrawal'], ['PUT', '/versions/pv_star_floater_v1'], ['PUT', '/versions/pv_star_floater_v1/research'],
    ])('AC-M05-07 a tenant admin gets 403 operator_only on %s %s', async (method, path) => {
      const req = method === 'PUT' ? t.http.put(`/api/v1/ops/catalogue${path}`) : t.http.post(`/api/v1/ops/catalogue${path}`).set('Idempotency-Key', newIdempotencyKey());
      const res = await req.set('Host', HOST).set('Authorization', `Bearer ${adminToken()}`).send({});
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('operator_only');
    });

    it('AC-M05-07 a workforce token without platform.operator is refused', async () => {
      const support = tokenFor({ tenantId: 'platform', roles: ['platform.support'], realm: 'workforce' });
      const res = await t.http.put('/api/v1/ops/catalogue/insurers').set('Authorization', `Bearer ${support}`).send({});
      expect(res.status).toBe(403);
    });
  });

  describe('Insurers and products', () => {
    it('AC-M05-07 deactivating an insurer takes its versions out of scope as insurer_inactive, and is audited', async () => {
      const res = await opPut('/insurers', { id: 'ins_star', name: 'Star Health', irdaiRegNo: '129', lines: ['HEALTH'], active: false });
      expect(res.status).toBe(200);
      expect((await rows()).find((r) => r.versionId === 'pv_star_floater_v1')).toMatchObject({ inScope: false, exclusion: 'insurer_inactive' });
      const audit = t.app.get<InMemoryAuditLog>(AUDIT_LOG).events.filter((e) => e.action === 'catalogue.insurer.upserted' && e.entityId === 'ins_star');
      expect(audit).toHaveLength(1);
    });

    it('AC-M05-07 a product cannot move to another insurer or line', async () => {
      const res = await opPut('/products', { id: 'prd_star_floater', insurerId: 'ins_care', line: 'HEALTH', name: 'Moved', category: 'HEALTH_FLOATER' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('product_identity_immutable');
    });

    it('AC-M05-07 a product for an unknown insurer is 404', async () => {
      const res = await opPut('/products', { id: 'prd_new', insurerId: 'ins_unknown', line: 'LIFE', name: 'New plan', category: 'TERM' });
      expect([res.status, res.body.code]).toEqual([404, 'insurer_not_found']);
    });

    it('AC-M05-01 a version for an unknown product is 404; a duplicate wording version is 409', async () => {
      const unknown = await opPost('/versions', { ...DRAFT, productId: 'prd_unknown' });
      expect([unknown.status, unknown.body.code]).toEqual([404, 'product_not_found']);
      const duplicate = await opPost('/versions', { ...DRAFT, wordingVersion: 'v1' });
      expect([duplicate.status, duplicate.body.code]).toEqual([409, 'duplicate_wording_version']);
    });

    it('AC-M05-01 an invalid UIN is rejected', async () => {
      const res = await opPost('/versions', { ...DRAFT, uin: 'bad-uin' });
      expect([res.status, res.body.code]).toEqual([400, 'invalid_uin']);
    });
  });

  describe('Events', () => {
    it('AC-M05-07 activation, withdrawal and research emit catalogue events with ids only', async () => {
      const id = await draft();
      await opPost(`/versions/${id}/activation`).expect(200);
      await opPost(`/versions/${id}/withdrawal`).expect(200);
      await opPut(`/versions/${id}/research`, { summary: 'Floater with restoration benefit.', points: ['Restoration once a year'], sourceRef: 'Wording v2', sourceDate: '2025-10-01' }).expect(200);
      const events = t.app.get<InMemoryOutbox>(OUTBOX).events.filter((e) => e.subject === id).map((e) => e.type);
      expect(events).toEqual(['catalogue.product_version.activated', 'catalogue.product_version.withdrawn', 'catalogue.research.updated']);
    });
  });
});
