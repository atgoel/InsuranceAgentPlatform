import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { CrmModule } from '../../src/modules/crm/crm.module';
import { DistributionModule } from '../../src/modules/distribution/distribution.module';
import { createTestApp, TestApp } from '../support/test-app';
import { newIdempotencyKey } from '../support/idempotency';
import { setupSellerWithRouting } from './fixtures';

/** AC-M04-31 POST /opportunities and AC-M04-32 board owner names (ADR-009). */
describe('AC-M04-31/32 Create opportunity for a customer', () => {
  let testApp: TestApp;
  let sellerToken: string;
  let sellerId: string;
  const host = 'acme.iap.test';
  const post = (path: string, body: object, token: string, key = newIdempotencyKey()) =>
    testApp.http.post(path).set('Host', host).set('Authorization', `Bearer ${token}`).set('Idempotency-Key', key).send(body);
  const get = (path: string, token: string) => testApp.http.get(path).set('Host', host).set('Authorization', `Bearer ${token}`);

  const createParty = async (token: string, mobile: string): Promise<string> => {
    const res = await post(
      '/api/v1/parties',
      { kind: 'PERSON', displayName: 'Ravi Kumar', contacts: [{ channel: 'MOBILE', value: mobile, isPrimary: true }], preferredLanguage: 'en' },
      token,
    );
    expect(res.status).toBe(201);
    return res.body.party.id;
  };

  const body = (partyId: string, expectedPremiumPaise: number = 1250000) => ({
    partyId,
    productInterest: 'HEALTH',
    title: 'Family health cover',
    expectedPremiumPaise,
  });

  beforeEach(async () => {
    testApp = await createTestApp({ imports: [CrmModule, DistributionModule] });
    const seller = await setupSellerWithRouting(testApp, 'member_create_opp');
    sellerToken = seller.token;
    sellerId = seller.memberId;
  });

  afterEach(async () => {
    await testApp.close();
  });

  it('AC-M04-31 opens a DISCOVERY opportunity owned by the caller with integer paise', async () => {
    const partyId = await createParty(sellerToken, '+919876510001');
    const res = await post('/api/v1/opportunities', body(partyId), sellerToken);
    expect(res.status).toBe(201);
    expect(res.body.stage).toBe('DISCOVERY');
    expect(res.body.partyId).toBe(partyId);
    expect(res.body.ownerMemberId).toBe(sellerId);
    expect(res.body.title).toBe('Family health cover');
    expect(res.body.productInterest).toBe('HEALTH');
    expect(res.body.expectedPremium).toEqual({ amountPaise: 1250000, currency: 'INR' });
    const stored = await get(`/api/v1/opportunities/${res.body.id}`, sellerToken);
    expect(stored.status).toBe(200);
    expect(stored.body.stage).toBe('DISCOVERY');
  });

  it('AC-M04-31 a party outside the caller scope is 404 party_not_found', async () => {
    const otherToken = (await setupSellerWithRouting(testApp, 'member_create_opp_other')).token;
    const partyId = await createParty(otherToken, '+919876510002');
    const res = await post('/api/v1/opportunities', body(partyId), sellerToken);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('party_not_found');
  });

  it('AC-M04-31 an unknown party is 404 party_not_found', async () => {
    const res = await post('/api/v1/opportunities', body('party_missing'), sellerToken);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('party_not_found');
  });

  it('AC-M04-31 a replay with the same idempotency key returns the same opportunity', async () => {
    const partyId = await createParty(sellerToken, '+919876510003');
    const key = newIdempotencyKey();
    const first = await post('/api/v1/opportunities', body(partyId), sellerToken, key);
    const second = await post('/api/v1/opportunities', body(partyId), sellerToken, key);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.id).toBe(first.body.id);
    const board = await get('/api/v1/opportunities?view=board', sellerToken);
    expect(board.body.stats.openCount).toBe(1);
  });

  it('AC-M04-31 a non-integer premium is 400', async () => {
    const partyId = await createParty(sellerToken, '+919876510004');
    const res = await post('/api/v1/opportunities', body(partyId, 100.5), sellerToken);
    expect(res.status).toBe(400);
  });

  it('AC-M04-32 board cards carry the owner display name', async () => {
    const partyId = await createParty(sellerToken, '+919876510005');
    const created = await post('/api/v1/opportunities', body(partyId), sellerToken);
    expect(created.status).toBe(201);
    const board = await get('/api/v1/opportunities?view=board', sellerToken);
    expect(board.status).toBe(200);
    const discovery = board.body.columns.find((c: { stage: string }) => c.stage === 'DISCOVERY');
    expect(discovery.items).toHaveLength(1);
    expect(discovery.items[0].id).toBe(created.body.id);
    expect(discovery.items[0].ownerName).toBe('Seller member_create_opp');
  });
});
