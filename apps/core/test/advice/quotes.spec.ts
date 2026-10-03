import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { AdviceModule } from '../../src/modules/advice/advice.module';
import { createTestApp, TestApp } from '../support/test-app';
import { setupSellerWithRouting } from '../crm/fixtures';
import { Api, Seller, V, addOption, adminToken, api, auditActions, complianceToken, DOC_REF, eventData, openQuote, opportunityFor, optionInput, setupTenant } from './fixtures';

/** AC-M06-05 quote workspace and option capture; AC-M06-10 record scope and tenant isolation on the quote endpoints. */
describe('AC-M06-05 Quote workspace', () => {
  let t: TestApp;
  let seller: Seller;
  let http: Api;
  let opp: { partyId: string; opportunityId: string };
  let quoteId: string;

  const add = (input: Record<string, unknown>, id = quoteId) => http.post(`/api/v1/quotes/${id}/options`, input);
  const view = async (id = quoteId) => (await http.get(`/api/v1/quotes/${id}`)).body;
  const errorOf = (res: { body: { errors?: Array<{ path: string; code: string }> } }) => (res.body.errors ?? []).map((e) => `${e.path}:${e.code}`);

  beforeEach(async () => {
    t = await createTestApp({ imports: [AdviceModule] });
    seller = await setupTenant(t);
    http = api(t, seller.token);
    opp = await opportunityFor(t, seller);
    quoteId = await openQuote(t, seller.token, opp);
  });
  afterEach(async () => t.close());

  describe('opening', () => {
    it('AC-M06-05 a new quote takes its party from the opportunity and its line from the product interest, with the scope disclosure', async () => {
      const res = await http.get(`/api/v1/quotes/${quoteId}`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        id: quoteId, opportunityId: opp.opportunityId, partyId: opp.partyId, line: 'LIFE', insuredPartyIds: [opp.partyId], requirements: { sumAssured: '1cr' },
        status: 'OPEN', options: [], createdAt: '2026-01-01T00:00:00.000Z',
        disclosure: 'Showing plans from your tied insurers only: HDFC Life, ICICI Prudential Life. This disclosure appears on shared comparisons.',
      });
      expect(res.body.adviceRecordId).toBeUndefined();
    });

    it.each<['SAVINGS_LIFE' | 'HEALTH', string]>([
      ['SAVINGS_LIFE', 'LIFE'],
      ['HEALTH', 'HEALTH'],
    ])('AC-M06-05 an opportunity interested in %s opens a %s quote', async (interest, line) => {
      const other = await opportunityFor(t, seller, interest);

      const id = await openQuote(t, seller.token, other);

      expect((await view(id)).line).toBe(line);
    });

    it('AC-M06-05 an insured party that does not exist is 404 and an unknown opportunity is 404', async () => {
      const missingParty = await http.post('/api/v1/quotes', { opportunityId: opp.opportunityId, insuredPartyIds: ['pty_missing'], requirements: {} });
      const missingOpp = await http.post('/api/v1/quotes', { opportunityId: 'opp_missing', insuredPartyIds: [], requirements: {} });

      expect(missingParty.status).toBe(404);
      expect(missingParty.body.code).toBe('party_not_found');
      expect(missingOpp.status).toBe(404);
      expect(missingOpp.body.code).toBe('opportunity_not_found');
    });

    it('AC-M06-05 a linked advice record must belong to the same party and shows its scope disclosure on the quote', async () => {
      const other = await opportunityFor(t, seller);
      const foreign = await http.post('/api/v1/advice-records', { partyId: other.partyId });
      const own = await http.post('/api/v1/advice-records', { partyId: opp.partyId, line: 'HEALTH' });

      const mismatch = await http.post('/api/v1/quotes', { opportunityId: opp.opportunityId, insuredPartyIds: [], requirements: {}, adviceRecordId: foreign.body.id });
      const linked = await http.post('/api/v1/quotes', { opportunityId: opp.opportunityId, insuredPartyIds: [], requirements: {}, adviceRecordId: own.body.id });

      expect(mismatch.status).toBe(400);
      expect(mismatch.body.code).toBe('party_mismatch');
      expect(linked.status).toBe(201);
      expect(linked.body.adviceRecordId).toBe(own.body.id);
      expect(linked.body.disclosure).toBe(own.body.scope.disclosure);
    });

    it('AC-M06-05 listing by opportunity returns { items } of its quotes and needs the opportunityId', async () => {
      const second = await openQuote(t, seller.token, opp);

      const list = await http.get(`/api/v1/quotes?opportunityId=${opp.opportunityId}`);
      const none = await http.get('/api/v1/quotes');

      expect(list.status).toBe(200);
      expect(list.body.items.map((q: { id: string }) => q.id)).toEqual([quoteId, second]);
      expect(none.status).toBe(400);
    });
  });

  describe('adding options', () => {
    it('AC-M06-05 an in-scope option is stored with the insurer from the catalogue and the advisor from the token, and emits quote.option.created', async () => {
      const res = await add(optionInput(V.term));

      expect(res.status).toBe(201);
      expect(res.body.options).toHaveLength(1);
      const option = res.body.options[0];
      expect(option).toMatchObject({
        versionId: V.term, insurerId: 'ins_hdfc_life', source: 'MANUAL_PORTAL', insurerQuoteRef: 'QREF-1', sumAssuredPaise: 1_000_000_000, validUntil: '2026-01-31',
        premium: { basePaise: 1_000_000, ridersPaise: 100_000, taxPaise: 198_000, totalPaise: 1_298_000, frequency: 'ANNUAL' },
        capturedBy: seller.memberId, capturedAt: '2026-01-01T00:00:00.000Z', productName: 'Click 2 Protect Supreme', insurerName: 'HDFC Life', category: 'TERM',
        expired: false, bi: { required: false, acknowledged: false, records: [] },
      });
      expect(res.body.comparison.find((r: { key: string }) => r.key === 'premium_total').values).toEqual([1_298_000]);
      expect(eventData(t, 'quote.option.created')).toEqual([{ quoteRequestId: quoteId, optionId: option.id, versionId: V.term }]);
      expect(t.metrics.counter('quote_options_total', 'Quote options captured', ['source']).get({ source: 'MANUAL_PORTAL' })).toBe(1);
    });

    it('AC-M06-05 a product outside the comparison scope is 403 product_out_of_scope and nothing is added', async () => {
      const res = await add(optionInput(V.outOfScope));

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('product_out_of_scope');
      expect(res.body.reason).toBe('insurer_not_tied');
      expect((await view()).options).toEqual([]);
      expect(eventData(t, 'quote.option.created')).toEqual([]);
    });

    it('AC-M06-05 premium components must add up: 400 premium_components_mismatch', async () => {
      const res = await add(optionInput(V.term, { premium: { basePaise: 1_000_000, ridersPaise: 100_000, taxPaise: 198_000, totalPaise: 1_298_001, frequency: 'ANNUAL' } }));

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('premium_components_mismatch');
      expect(errorOf(res)).toEqual(['premium.totalPaise:premium_components_mismatch']);
      expect((await view()).options).toEqual([]);
    });

    it.each([
      ['more than 60 days ahead', '2026-03-03'],
      ['in the past', '2025-12-31'],
    ])('AC-M06-05 a validity %s is 400 invalid_validity, while exactly 60 days ahead is accepted', async (_label, validUntil) => {
      const res = await add(optionInput(V.term, { validUntil }));
      const boundary = await add(optionInput(V.term, { validUntil: '2026-03-02' }));

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('invalid_validity');
      expect(boundary.status).toBe(201);
    });

    it('AC-M06-05 the same product and insurer quote reference twice is 409 duplicate_option; a different reference is accepted', async () => {
      await add(optionInput(V.term));

      const duplicate = await add(optionInput(V.term));
      const other = await add(optionInput(V.term, { insurerQuoteRef: 'QREF-2' }));

      expect(duplicate.status).toBe(409);
      expect(duplicate.body.code).toBe('duplicate_option');
      expect(other.status).toBe(201);
      expect(other.body.options).toHaveLength(2);
    });

    it('AC-M06-05 the 11th option is 422 too_many_options', async () => {
      for (let i = 1; i <= 10; i += 1) await addOption(t, seller.token, quoteId, optionInput(V.term, { insurerQuoteRef: `QREF-${i}` }));

      const res = await add(optionInput(V.term, { insurerQuoteRef: 'QREF-11' }));

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('too_many_options');
      expect((await view()).options).toHaveLength(10);
    });

    it('AC-M06-05 the request cannot name the insurer, and list sizes and unknown fields are validated', async () => {
      const insurer = await add(optionInput(V.term, { insurerId: 'ins_star' }));
      const coverage = await add(optionInput(V.term, { coverage: Array.from({ length: 31 }, (_, i) => ({ label: `L${i}`, value: 'v' })) }));
      const source = await add(optionInput(V.term, { source: 'TELEPATHY' }));

      expect([insurer.status, coverage.status, source.status]).toEqual([400, 400, 400]);
      expect(insurer.body.code).toBe('validation_failed');
      expect(errorOf(coverage)).toEqual(['coverage:too_big']);
    });

    it('AC-M06-05 removing an option is 204 and takes it off the quote and the comparison; an unknown option is 404', async () => {
      const keep = await addOption(t, seller.token, quoteId, optionInput(V.term));
      const drop = await addOption(t, seller.token, quoteId, optionInput(V.term, { insurerQuoteRef: 'QREF-2' }));

      const res = await http.del(`/api/v1/quotes/${quoteId}/options/${drop}`);
      const again = await http.del(`/api/v1/quotes/${quoteId}/options/${drop}`);

      expect(res.status).toBe(204);
      expect(again.status).toBe(404);
      expect(again.body.code).toBe('quote_option_not_found');
      const after = await view();
      expect(after.options.map((o: { id: string }) => o.id)).toEqual([keep]);
      expect(after.comparison.find((r: { key: string }) => r.key === 'premium_total').values).toEqual([1_298_000]);
      expect(auditActions(t, quoteId)).toContain('quote.option.removed');
    });
  });

  describe('AC-M06-10 record scope and tenant isolation', () => {
    it('AC-M06-10 another salesperson and another tenant get 404 on every quote and benefit-illustration route', async () => {
      const optionId = await addOption(t, seller.token, quoteId, optionInput(V.term));
      const bi = await http.post(`/api/v1/quote-options/${optionId}/benefit-illustrations`, { documentRef: DOC_REF, insurerBiVersion: 'BI-1' });
      const stranger = await setupSellerWithRouting(t, 'quote_stranger');
      const clients = [api(t, stranger.token), api(t, adminToken('ten_zen'), 'zen.iap.test')];

      for (const client of clients) {
        const results = await Promise.all([
          client.get(`/api/v1/quotes/${quoteId}`),
          client.get(`/api/v1/quotes?opportunityId=${opp.opportunityId}`),
          client.post(`/api/v1/quotes/${quoteId}/options`, optionInput(V.term, { insurerQuoteRef: 'X' })),
          client.del(`/api/v1/quotes/${quoteId}/options/${optionId}`),
          client.post(`/api/v1/quotes/${quoteId}/shares`),
          client.post(`/api/v1/quotes/${quoteId}/selection`, { optionId }),
          client.post(`/api/v1/quote-options/${optionId}/benefit-illustrations`, { documentRef: DOC_REF, insurerBiVersion: 'BI-2' }),
          client.post(`/api/v1/benefit-illustrations/${bi.body.id}/acknowledgement`, { method: 'CUSTOMER_LINK' }),
          client.post('/api/v1/quotes', { opportunityId: opp.opportunityId, insuredPartyIds: [], requirements: {} }),
        ]);
        expect(results.map((r) => r.status)).toEqual(Array(9).fill(404));
      }
      const after = await view();
      expect(after).toMatchObject({ status: 'OPEN', version: 3 });
      expect(after.options).toHaveLength(1);
      expect(after.options[0].bi.records).toHaveLength(1);
      expect(after.options[0].bi.acknowledged).toBe(false);
    });

    it('AC-M06-10 compliance can read quotes but not write; a tenant admin can read', async () => {
      const optionId = await addOption(t, seller.token, quoteId, optionInput(V.term));
      const compliance = api(t, complianceToken());

      const read = await compliance.get(`/api/v1/quotes/${quoteId}`);
      const writes = await Promise.all([
        compliance.post('/api/v1/quotes', { opportunityId: opp.opportunityId, insuredPartyIds: [], requirements: {} }),
        compliance.post(`/api/v1/quotes/${quoteId}/options`, optionInput(V.term, { insurerQuoteRef: 'X' })),
        compliance.post(`/api/v1/quotes/${quoteId}/shares`),
        compliance.post(`/api/v1/quotes/${quoteId}/selection`, { optionId }),
        compliance.post(`/api/v1/quote-options/${optionId}/benefit-illustrations`, { documentRef: DOC_REF, insurerBiVersion: 'BI-1' }),
      ]);

      expect(read.status).toBe(200);
      expect(writes.map((r) => [r.status, r.body.code])).toEqual(Array(5).fill([403, 'permission_denied']));
      expect((await api(t, adminToken()).get(`/api/v1/quotes/${quoteId}`)).status).toBe(200);
    });
  });
});
