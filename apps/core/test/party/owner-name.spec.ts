import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { PartyModule } from '../../src/modules/party/party.module';
import { DistributionModule } from '../../src/modules/distribution/distribution.module';
import { createTestApp, TestApp } from '../support/test-app';
import { tokenFor } from '../support/tokens';
import { newIdempotencyKey } from '../support/idempotency';
import { activateSeller } from '../distribution/fixtures';

/** AC-M03-20 owner names on the customer list and record (ADR-009). */
describe('AC-M03-20 Party ownerName', () => {
  let testApp: TestApp;
  const host = 'acme.iap.test';

  const createParty = async (token: string, displayName: string, mobile: string): Promise<string> => {
    const res = await testApp.http
      .post('/api/v1/parties')
      .set('Host', host)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', newIdempotencyKey())
      .send({ kind: 'PERSON', displayName, contacts: [{ channel: 'MOBILE', value: mobile, isPrimary: true }], preferredLanguage: 'en' });
    expect(res.status).toBe(201);
    return res.body.party.id;
  };

  const createSeller = async (): Promise<string> => {
    const admin = tokenFor({ tenantId: 'ten_acme', roles: ['TENANT_ADMIN'], memberId: 'admin' });
    const res = await testApp.http
      .post('/api/v1/members')
      .set('Host', host)
      .set('Authorization', `Bearer ${admin}`)
      .set('Idempotency-Key', newIdempotencyKey())
      .send({ displayName: 'Asha Verma', phone: '+919700001111', roles: ['SALESPERSON'], salespersonType: 'EMPLOYEE', orgUnitId: 'ou_root' });
    expect(res.status).toBe(201);
    await activateSeller(testApp, res.body.id, 'EMPLOYEE');
    return res.body.id;
  };

  beforeEach(async () => {
    testApp = await createTestApp({ imports: [PartyModule, DistributionModule] });
  });

  afterEach(async () => {
    await testApp.close();
  });

  it('AC-M03-20 list and record carry the owner display name', async () => {
    const memberId = await createSeller();
    const token = tokenFor({ tenantId: 'ten_acme', roles: ['SALESPERSON'], memberId, orgUnitId: 'ou_root' });
    const partyId = await createParty(token, 'Ravi Kumar', '+919876500001');

    const list = await testApp.http.get('/api/v1/parties').set('Host', host).set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].ownerMemberId).toBe(memberId);
    expect(list.body.items[0].ownerName).toBe('Asha Verma');

    const detail = await testApp.http.get(`/api/v1/parties/${partyId}`).set('Host', host).set('Authorization', `Bearer ${token}`);
    expect(detail.status).toBe(200);
    expect(detail.body.ownerName).toBe('Asha Verma');
  });

  it('AC-M03-20 an unknown owner member leaves ownerName absent without error', async () => {
    const token = tokenFor({ tenantId: 'ten_acme', roles: ['SALESPERSON'], memberId: 'member_ghost', orgUnitId: 'ou_root' });
    const partyId = await createParty(token, 'Meera Shah', '+919876500002');

    const list = await testApp.http.get('/api/v1/parties').set('Host', host).set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body.items[0].ownerMemberId).toBe('member_ghost');
    expect(Object.keys(list.body.items[0])).not.toContain('ownerName');

    const detail = await testApp.http.get(`/api/v1/parties/${partyId}`).set('Host', host).set('Authorization', `Bearer ${token}`);
    expect(detail.status).toBe(200);
    expect(Object.keys(detail.body)).not.toContain('ownerName');
  });
});
