import { newIdempotencyKey } from '../support/idempotency';
import { TenancyModule } from '../../src/modules/tenancy/tenancy.module';
import { createTestApp, TestApp } from '../support/test-app';
import { tokenFor } from '../support/tokens';

/** AC-CR001-04 (M01 part): /api/v1/tenant/custom-fields over HTTP. */
describe('AC-CR001-04 custom field endpoints', () => {
  let testApp: TestApp;
  const admin = (tenantId = 'ten_acme') => `Bearer ${tokenFor({ tenantId, roles: ['TENANT_ADMIN'] })}`;
  const hostOf = (tenantId: string) => (tenantId === 'ten_acme' ? 'acme.iap.test' : 'zen.iap.test');
  const post = (body: Record<string, unknown>, tenantId = 'ten_acme', auth = admin(tenantId)) =>
    testApp.http.post('/api/v1/tenant/custom-fields').set('Host', hostOf(tenantId)).set('Authorization', auth).set('Idempotency-Key', newIdempotencyKey()).send(body);
  const patch = (id: string, body: Record<string, unknown>, ifMatch: string | undefined, tenantId = 'ten_acme') => {
    const req = testApp.http.patch(`/api/v1/tenant/custom-fields/${id}`).set('Host', hostOf(tenantId)).set('Authorization', admin(tenantId));
    return (ifMatch ? req.set('If-Match', ifMatch) : req).send(body);
  };
  const branchCode = { entity: 'party', key: 'branch_code', label: { en: 'Branch code' }, type: 'text', piiClass: 'P0', reportable: true };

  beforeAll(async () => {
    testApp = await createTestApp({ imports: [TenancyModule] });
  });
  afterAll(async () => {
    await testApp.close();
  });

  it('AC-CR001-04 creates a reportable P0 field on party and returns 201 with the definition', async () => {
    const res = await post(branchCode);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ entity: 'party', key: 'branch_code', label: { en: 'Branch code' }, type: 'text', piiClass: 'P0', reportable: true, required: false, active: true, version: 1 });
    expect(res.body.id).toMatch(/^cfd_/);
  });

  it('AC-CR001-04 lists definitions with usage, filtered by entity', async () => {
    await post({ ...branchCode, entity: 'lead', key: 'list_probe' });
    const res = await testApp.http.get('/api/v1/tenant/custom-fields?entity=lead').set('Host', 'acme.iap.test').set('Authorization', admin());
    expect(res.status).toBe(200);
    expect(res.body.items.map((d: { key: string }) => d.key)).toEqual(['list_probe']);
    expect(res.body.usage).toEqual({ active: 2, limit: 50 });
  });

  it('AC-CR001-04 refuses P3 with 400 pii_class_not_allowed', async () => {
    const res = await post({ ...branchCode, key: 'aadhaar_no', piiClass: 'P3' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('pii_class_not_allowed');
  });

  it('AC-CR001-04 refuses a reportable P2 field with 400 p2_not_reportable', async () => {
    const res = await post({ ...branchCode, key: 'income_band', piiClass: 'P2', reportable: true });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('p2_not_reportable');
  });

  it('AC-CR001-04 a duplicate (entity, key) is 409 custom_field_exists', async () => {
    const res = await post(branchCode);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('custom_field_exists');
  });

  it('AC-CR001-04 the 51st definition on a BUSINESS plan is 422 custom_field_limit_reached with the limit', async () => {
    for (let i = 0; i < 50; i++) {
      const created = await post({ ...branchCode, key: `field_${String(i).padStart(2, '0')}` }, 'ten_zen');
      expect(created.status).toBe(201);
    }
    const res = await post({ ...branchCode, key: 'field_over' }, 'ten_zen');
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('custom_field_limit_reached');
    expect(res.body.limit).toBe(50);
  });

  it('AC-CR001-04 PATCH with If-Match revises the definition and answers the new ETag', async () => {
    const created = await post({ ...branchCode, key: 'patch_me', label: { en: 'Patch me' } });
    const res = await patch(created.body.id, { label: { en: 'Patched', hi: 'Badla' }, required: true }, '"v1"');
    expect(res.status).toBe(200);
    expect(res.headers.etag).toBe('"v2"');
    expect(res.body).toMatchObject({ id: created.body.id, label: { en: 'Patched', hi: 'Badla' }, required: true, version: 2 });
  });

  it('AC-CR001-04 PATCH with a stale If-Match is 412', async () => {
    const created = await post({ ...branchCode, key: 'stale_me' });
    await patch(created.body.id, { required: true }, '"v1"');
    const res = await patch(created.body.id, { required: false }, '"v1"');
    expect(res.status).toBe(412);
    expect(res.body.code).toBe('version_mismatch');
  });

  it('AC-CR001-04 PATCH without If-Match is 400 if_match_required', async () => {
    const created = await post({ ...branchCode, key: 'nomatch' });
    const res = await patch(created.body.id, { required: true }, undefined);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('if_match_required');
  });

  it.each(['type', 'key', 'piiClass'])('AC-CR001-04 PATCH with %s is 400 validation_failed (field is immutable)', async (field) => {
    const created = await post({ ...branchCode, key: `imm_${field.toLowerCase()}` });
    const res = await patch(created.body.id, { [field]: 'number' }, '"v1"');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('validation_failed');
  });

  it('AC-CR001-04 removing an enum option is 400 enum_option_removed', async () => {
    const created = await post({
      ...branchCode, key: 'tier', type: 'enum', reportable: false,
      enumOptions: [{ value: 'GOLD', label: { en: 'Gold' } }, { value: 'SILVER', label: { en: 'Silver' } }],
    });
    expect(created.status).toBe(201);
    const res = await patch(created.body.id, { enumOptions: [{ value: 'GOLD', label: { en: 'Gold' } }] }, '"v1"');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('enum_option_removed');
  });

  it('AC-CR001-04 PATCH of an unknown id is 404', async () => {
    const res = await patch('cfd_missing', { required: true }, '"v1"');
    expect(res.status).toBe(404);
  });

  it('AC-CR001-04 a salesperson may read but not write definitions (403)', async () => {
    const auth = `Bearer ${tokenFor({ tenantId: 'ten_acme', roles: ['SALESPERSON'] })}`;
    const write = await post({ ...branchCode, key: 'sp_field' }, 'ten_acme', auth);
    expect(write.status).toBe(403);
    const read = await testApp.http.get('/api/v1/tenant/custom-fields').set('Host', 'acme.iap.test').set('Authorization', auth);
    expect(read.status).toBe(200);
  });

  it('AC-CR001-04 tenant B cannot see tenant A definitions', async () => {
    const res = await testApp.http.get('/api/v1/tenant/custom-fields?entity=party').set('Host', 'zen.iap.test').set('Authorization', admin('ten_zen'));
    expect(res.status).toBe(200);
    expect(res.body.items.map((d: { key: string }) => d.key)).not.toContain('branch_code');
  });
});
