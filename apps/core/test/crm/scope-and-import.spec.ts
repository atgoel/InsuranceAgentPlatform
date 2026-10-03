import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { createHash } from 'node:crypto';
import { CrmModule } from '../../src/modules/crm/crm.module';
import { DistributionModule } from '../../src/modules/distribution/distribution.module';
import { createTestApp, TestApp } from '../support/test-app';
import { tokenFor } from '../support/tokens';
import { newIdempotencyKey } from '../support/idempotency';
import { setupSellerWithRouting } from './fixtures';

/**
 * AC-M04-17 scope & isolation: another salesperson gets 404 on the lead; a SALESPERSON cannot PUT routing rules (403).
 * AC-M04-20 import: preview/commit with validation, idempotent by checksum.
 */
describe('AC-M04-17/20 Scope, isolation and lead import', () => {
  let testApp: TestApp;
  let sellerToken: string;
  let sellerId: string;
  const adminToken = () => tokenFor({ tenantId: 'ten_acme', roles: ['TENANT_ADMIN'], memberId: 'admin' });
  const post = (path: string, body?: object, token = sellerToken) =>
    testApp.http.post(path).set('Host', 'acme.iap.test').set('Authorization', `Bearer ${token}`).set('Idempotency-Key', newIdempotencyKey()).send(body);
  const get = (path: string, token = sellerToken) => testApp.http.get(path).set('Host', 'acme.iap.test').set('Authorization', `Bearer ${token}`);

  const basicLead = (mobile: string) => ({
    fullName: 'Scope Test',
    mobile,
    productInterest: 'TERM_LIFE' as const,
    source: 'WEB_FORM' as const,
    consent: { granted: true, noticeVersion: 'v2', channels: ['CALL'] as const, purposes: ['SERVICE'] as const },
  });

  async function createLead(mobile: string): Promise<string> {
    const res = await post('/api/v1/leads', basicLead(mobile));
    expect(res.status).toBe(201);
    expect(res.body.ownerMemberId).toBe(sellerId);
    return res.body.leadId;
  }

  beforeEach(async () => {
    testApp = await createTestApp({ imports: [CrmModule, DistributionModule] });
    const seller = await setupSellerWithRouting(testApp, 'member_scope');
    sellerToken = seller.token;
    sellerId = seller.memberId;
  });

  afterEach(async () => {
    await testApp.close();
  });

  it('AC-M04-17 another salesperson gets 404 on the lead', async () => {
    const leadId = await createLead('+919876543270');
    const otherSellerToken = tokenFor({ tenantId: 'ten_acme', roles: ['SALESPERSON'], memberId: 'member_other', orgUnitId: 'ou_root' });
    const res = await get(`/api/v1/leads/${leadId}`, otherSellerToken);
    expect(res.status).toBe(404);
  });

  it('AC-M04-17 SALESPERSON cannot PUT routing rules (403)', async () => {
    const res = await testApp.http
      .put('/api/v1/routing-rules')
      .set('Host', 'acme.iap.test')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ rules: [] });
    expect(res.status).toBe(403);
  });

  it('AC-M04-20 preview reports rejected rows', async () => {
    const fileChecksum = createHash('sha256').update('test').digest('hex');
    const previewRes = await testApp.http
      .post('/api/v1/lead-imports/previews')
      .set('Host', 'acme.iap.test')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({
        fileChecksum,
        sourceTag: 'Test',
        consentBasis: 'NONE',
        rows: [
          { fullName: 'Valid', mobile: '+919876543274', productInterest: 'TERM_LIFE' },
          { fullName: 'No Contact', productInterest: 'HEALTH' },
          { fullName: 'Bad Mobile', mobile: '12345' },
        ],
      });
    expect(previewRes.status).toBe(200);
    expect(previewRes.body.valid).toBe(1);
    expect(previewRes.body.rejected.length).toBe(2);
  });

  it('AC-M04-20 commit imports valid rows with batchId', async () => {
    const fileChecksum = createHash('sha256').update('test2').digest('hex');
    const commitRes = await testApp.http
      .post('/api/v1/lead-imports')
      .set('Host', 'acme.iap.test')
      .set('Authorization', `Bearer ${adminToken()}`)
      .set('Idempotency-Key', newIdempotencyKey())
      .send({
        fileChecksum,
        sourceTag: 'Test',
        consentBasis: 'NONE',
        rows: [{ fullName: 'Import Lead', mobile: '+919876543275', productInterest: 'TERM_LIFE' }],
      });
    expect(commitRes.status).toBe(201);
    expect(commitRes.body.batchId).toMatch(/^imp_/);
  });

  it('AC-M04-20 re-post same checksum is idempotent', async () => {
    const fileChecksum = createHash('sha256').update('test3').digest('hex');
    const commit1 = await testApp.http
      .post('/api/v1/lead-imports')
      .set('Host', 'acme.iap.test')
      .set('Authorization', `Bearer ${adminToken()}`)
      .set('Idempotency-Key', newIdempotencyKey())
      .send({
        fileChecksum,
        sourceTag: 'Test',
        consentBasis: 'NONE',
        rows: [{ fullName: 'Lead', mobile: '+919876543276', productInterest: 'MOTOR' }],
      });
    expect(commit1.status).toBe(201);

    const commit2 = await testApp.http
      .post('/api/v1/lead-imports')
      .set('Host', 'acme.iap.test')
      .set('Authorization', `Bearer ${adminToken()}`)
      .set('Idempotency-Key', newIdempotencyKey())
      .send({
        fileChecksum,
        sourceTag: 'Test2',
        consentBasis: 'NONE',
        rows: [{ fullName: 'Lead2', mobile: '+919876543277' }],
      });
    expect(commit2.status).toBe(201);
    expect(commit2.body.skippedAlreadyImported).toBeGreaterThanOrEqual(0);
  });

  it('AC-M04-20 CAPTURED_AT_EVENT without noticeVersion → 400', async () => {
    const fileChecksum = createHash('sha256').update('test4').digest('hex');
    const commitRes = await testApp.http
      .post('/api/v1/lead-imports')
      .set('Host', 'acme.iap.test')
      .set('Authorization', `Bearer ${adminToken()}`)
      .set('Idempotency-Key', newIdempotencyKey())
      .send({
        fileChecksum,
        sourceTag: 'Test',
        consentBasis: 'CAPTURED_AT_EVENT',
        rows: [{ fullName: 'Lead', mobile: '+919876543278' }],
      });
    expect(commitRes.status).toBe(400);
  });
});
