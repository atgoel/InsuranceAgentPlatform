import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { AdviceModule } from '../../src/modules/advice/advice.module';
import { createTestApp, TestApp } from '../support/test-app';
import { Api, DOC_REF, EVIDENCE_REF, Seller, V, addOption, api, auditActions, eventData, openQuote, opportunityFor, optionInput, setupTenant } from './fixtures';

const DAY_MS = 86_400_000;

/** AC-M06-06 selection (expiry, BI gate, once only); AC-M06-07 benefit-illustration evidence. */
describe('AC-M06-06/07 Selection and benefit-illustration evidence', () => {
  let t: TestApp;
  let seller: Seller;
  let http: Api;

  const quoteFor = async (interest: 'TERM_LIFE' | 'SAVINGS_LIFE' | 'HEALTH') => {
    const opp = await opportunityFor(t, seller, interest);
    return { opp, quoteId: await openQuote(t, seller.token, opp) };
  };
  const select = (quoteId: string, optionId: string) => http.post(`/api/v1/quotes/${quoteId}/selection`, { optionId });
  const attach = (optionId: string, body: Record<string, unknown> = { documentRef: DOC_REF, insurerBiVersion: 'BI-2026-03' }) => http.post(`/api/v1/quote-options/${optionId}/benefit-illustrations`, body);
  const acknowledge = (biId: string, body: Record<string, unknown> = { method: 'CUSTOMER_LINK' }) => http.post(`/api/v1/benefit-illustrations/${biId}/acknowledgement`, body);

  beforeEach(async () => {
    t = await createTestApp({ imports: [AdviceModule] });
    seller = await setupTenant(t);
    http = api(t, seller.token);
  });
  afterEach(async () => t.close());

  describe('AC-M06-06 selection', () => {
    it('AC-M06-06 selecting a term option needs no BI: the quote is SELECTED, quote.option.selected carries the paise total and the selection time is observed', async () => {
      const { quoteId } = await quoteFor('TERM_LIFE');
      const optionId = await addOption(t, seller.token, quoteId, optionInput(V.term));
      t.clock.advance(120_000);

      const res = await select(quoteId, optionId);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ status: 'SELECTED', selectedOptionId: optionId, selectedAt: '2026-01-01T00:02:00.000Z' });
      expect(res.body.options[0].bi).toEqual({ required: false, acknowledged: false, records: [] });
      expect(eventData(t, 'quote.option.selected')).toEqual([{ quoteRequestId: quoteId, optionId, versionId: V.term, totalPaise: 1_298_000 }]);
      const histogram = t.metrics.histogram('quote_selection_seconds', 'Seconds from quote open to selection', [], [60]);
      expect([histogram.count(), histogram.sum()]).toEqual([1, 120]);
    });

    it('AC-M06-06 selecting a health option needs no BI', async () => {
      const { quoteId } = await quoteFor('HEALTH');
      const optionId = await addOption(t, seller.token, quoteId, optionInput(V.health));

      const res = await select(quoteId, optionId);

      expect(res.status).toBe(200);
      expect(res.body.options[0]).toMatchObject({ category: 'HEALTH_INDIVIDUAL', bi: { required: false } });
    });

    it('AC-M06-06 an option past its validity is 422 quote_expired and shown as expired; the quote stays unselected', async () => {
      const { quoteId } = await quoteFor('TERM_LIFE');
      const optionId = await addOption(t, seller.token, quoteId, optionInput(V.term));
      t.clock.advance(40 * DAY_MS);

      const res = await select(quoteId, optionId);
      const after = await http.get(`/api/v1/quotes/${quoteId}`);

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('quote_expired');
      expect(after.body.status).toBe('OPEN');
      expect(after.body.options[0].expired).toBe(true);
      expect(eventData(t, 'quote.option.selected')).toEqual([]);
    });

    it('AC-M06-06 an option is still selectable on its last valid day', async () => {
      const { quoteId } = await quoteFor('TERM_LIFE');
      const optionId = await addOption(t, seller.token, quoteId, optionInput(V.term));
      t.clock.advance(30 * DAY_MS);

      const res = await select(quoteId, optionId);

      expect(res.status).toBe(200);
    });

    it.each([
      ['savings', V.savings, 'SAVINGS'],
      ['ULIP', V.ulip, 'ULIP'],
    ])('AC-M06-06 a %s option is 422 bi_acknowledgement_required until a BI is attached and acknowledged', async (_label, versionId, category) => {
      const { quoteId } = await quoteFor('SAVINGS_LIFE');
      const optionId = await addOption(t, seller.token, quoteId, optionInput(versionId));

      const none = await select(quoteId, optionId);
      const biId = (await attach(optionId)).body.id as string;
      const attached = await select(quoteId, optionId);
      await acknowledge(biId);
      const acknowledged = await select(quoteId, optionId);

      expect(none.status).toBe(422);
      expect(none.body.code).toBe('bi_acknowledgement_required');
      expect(attached.status).toBe(422);
      expect(attached.body.code).toBe('bi_acknowledgement_required');
      expect(acknowledged.status).toBe(200);
      expect(acknowledged.body.options[0]).toMatchObject({ category, bi: { required: true, acknowledged: true } });
      expect(eventData(t, 'quote.option.selected')).toHaveLength(1);
    });

    it('AC-M06-06 a BI acknowledged on one option does not unlock another option', async () => {
      const { quoteId } = await quoteFor('SAVINGS_LIFE');
      const first = await addOption(t, seller.token, quoteId, optionInput(V.savings));
      const second = await addOption(t, seller.token, quoteId, optionInput(V.ulip));
      await acknowledge((await attach(first)).body.id as string);

      const res = await select(quoteId, second);

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('bi_acknowledgement_required');
      expect(res.body.optionId).toBe(second);
    });

    it('AC-M06-06 only one selection: a second is 422 quote_already_selected and the first stands; removal after selection is refused', async () => {
      const { quoteId } = await quoteFor('TERM_LIFE');
      const first = await addOption(t, seller.token, quoteId, optionInput(V.term));
      const second = await addOption(t, seller.token, quoteId, optionInput(V.term, { insurerQuoteRef: 'QREF-2' }));
      await select(quoteId, first);

      const again = await select(quoteId, second);
      const removal = await http.del(`/api/v1/quotes/${quoteId}/options/${first}`);

      expect(again.status).toBe(422);
      expect(again.body.code).toBe('quote_already_selected');
      expect(removal.status).toBe(422);
      expect(removal.body.code).toBe('quote_selected');
      expect((await http.get(`/api/v1/quotes/${quoteId}`)).body).toMatchObject({ status: 'SELECTED', selectedOptionId: first });
      expect(eventData(t, 'quote.option.selected')).toHaveLength(1);
    });

    it('AC-M06-06 an option that is not on the quote is 404', async () => {
      const { quoteId } = await quoteFor('TERM_LIFE');
      await addOption(t, seller.token, quoteId, optionInput(V.term));

      const res = await select(quoteId, 'qop_missing');

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('quote_option_not_found');
    });
  });

  describe('AC-M06-07 benefit-illustration evidence', () => {
    let optionId: string;
    let quoteId: string;

    beforeEach(async () => {
      ({ quoteId } = await quoteFor('SAVINGS_LIFE'));
      optionId = await addOption(t, seller.token, quoteId, optionInput(V.savings));
    });

    it('AC-M06-07 attaching records the document pointer, the insurer BI version and who uploaded it, and shows on the quote option', async () => {
      t.clock.advance(1_000);

      const res = await attach(optionId);

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ quoteOptionId: optionId, documentRef: DOC_REF, insurerBiVersion: 'BI-2026-03', uploadedBy: seller.memberId, uploadedAt: '2026-01-01T00:00:01.000Z' });
      expect(res.body.acknowledgement).toBeUndefined();
      const quote = (await http.get(`/api/v1/quotes/${quoteId}`)).body;
      expect(quote.options[0].bi).toMatchObject({ required: true, acknowledged: false });
      expect(quote.options[0].bi.records.map((b: { id: string }) => b.id)).toEqual([res.body.id]);
    });

    it('AC-M06-07 a malformed document reference is 400 and the request cannot carry a premium or illustration', async () => {
      const badRef = await attach(optionId, { documentRef: 'file.pdf', insurerBiVersion: 'BI-1' });
      const computed = await attach(optionId, { documentRef: DOC_REF, insurerBiVersion: 'BI-1', premium: { totalPaise: 1 }, illustration: { irr: 0.07 } });

      expect(badRef.status).toBe(400);
      expect(badRef.body.code).toBe('invalid_document_ref');
      expect(computed.status).toBe(400);
      expect(computed.body.code).toBe('validation_failed');
      expect((await http.get(`/api/v1/quotes/${quoteId}`)).body.options[0].bi.records).toEqual([]);
    });

    it('AC-M06-07 a customer-link acknowledgement records method, time and actor, emits advice.bi.acknowledged and is audited', async () => {
      const biId = (await attach(optionId)).body.id as string;
      t.clock.advance(5_000);

      const res = await acknowledge(biId);

      expect(res.status).toBe(200);
      expect(res.body.acknowledgement).toEqual({ method: 'CUSTOMER_LINK', at: '2026-01-01T00:00:05.000Z', by: seller.memberId });
      expect(eventData(t, 'advice.bi.acknowledged')).toEqual([{ biId, quoteOptionId: optionId, method: 'CUSTOMER_LINK' }]);
      expect(auditActions(t, biId)).toEqual(['advice.bi.attached', 'advice.bi.acknowledged']);
    });

    it('AC-M06-07 a second acknowledgement is 422 bi_already_acknowledged and the first stands', async () => {
      const biId = (await attach(optionId)).body.id as string;
      await acknowledge(biId);

      const again = await acknowledge(biId, { method: 'ASSISTED', evidenceRef: EVIDENCE_REF });

      expect(again.status).toBe(422);
      expect(again.body.code).toBe('bi_already_acknowledged');
      const records = (await http.get(`/api/v1/quotes/${quoteId}`)).body.options[0].bi.records;
      expect(records[0].acknowledgement.method).toBe('CUSTOMER_LINK');
      expect(eventData(t, 'advice.bi.acknowledged')).toHaveLength(1);
    });

    it('AC-M06-07 an ASSISTED acknowledgement without evidence is 400 and is not recorded; with evidence it is kept', async () => {
      const biId = (await attach(optionId)).body.id as string;

      const without = await acknowledge(biId, { method: 'ASSISTED' });
      const withEvidence = await acknowledge(biId, { method: 'ASSISTED', evidenceRef: EVIDENCE_REF });

      expect(without.status).toBe(400);
      expect(without.body.code).toBe('evidence_required');
      expect(withEvidence.status).toBe(200);
      expect(withEvidence.body.acknowledgement).toMatchObject({ method: 'ASSISTED', evidenceRef: EVIDENCE_REF, by: seller.memberId });
    });

    it('AC-M06-07 an unknown BI or option is 404', async () => {
      const unknownBi = await acknowledge('bil_missing');
      const unknownOption = await attach('qop_missing');

      expect(unknownBi.status).toBe(404);
      expect(unknownBi.body.code).toBe('benefit_illustration_not_found');
      expect(unknownOption.status).toBe(404);
      expect(unknownOption.body.code).toBe('quote_option_not_found');
    });
  });
});
