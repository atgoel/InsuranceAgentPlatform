import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { AdviceModule } from '../../src/modules/advice/advice.module';
import { CalculatorService } from '../../src/modules/advice/application/calculator.service';
import { createTestApp, TestApp } from '../support/test-app';
import { setupSellerWithRouting } from '../crm/fixtures';
import { Api, Seller, V, adminToken, api, auditActions, complianceToken, eventData, opportunityFor, setupTenant } from './fixtures';

const RATIONALE = 'Pure term cover fits the stated protection gap and budget';
const FLOATER_INPUT = { cityTier: 2, members: [{ age: 35 }, { age: 33 }] };

/** AC-M06-04 advice record: scope snapshot, in-scope recommendations, choice reason, finalisation, immutability. */
describe('AC-M06-04 Advice record', () => {
  let t: TestApp;
  let seller: Seller;
  let http: Api;
  let opp: { partyId: string; opportunityId: string };

  const start = async (body: Record<string, unknown> = { partyId: opp.partyId, opportunityId: opp.opportunityId, line: 'LIFE' }) => http.post('/api/v1/advice-records', body);
  const started = async (): Promise<{ id: string; version: number }> => {
    const res = await start();
    expect(res.status).toBe(201);
    return { id: res.body.id as string, version: res.body.version as number };
  };
  const recommend = (id: string, versionId: string = V.term, rationale: string = RATIONALE) => http.post(`/api/v1/advice-records/${id}/recommendations`, { versionId, rationale });
  const current = async (id: string) => (await http.get(`/api/v1/advice-records/${id}`)).body;
  const choose = async (id: string, body: object, version?: number) => http.put(`/api/v1/advice-records/${id}/customer-choice`, body, `"v${version ?? (await current(id)).version}"`);

  beforeEach(async () => {
    t = await createTestApp({ imports: [AdviceModule] });
    seller = await setupTenant(t);
    http = api(t, seller.token);
    opp = await opportunityFor(t, seller);
  });
  afterEach(async () => t.close());

  it('AC-M06-04 starting snapshots the M05 scope: in-scope versions with names, the disclosure, the exclusions count and the advisor', async () => {
    const res = await start();

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      partyId: opp.partyId, opportunityId: opp.opportunityId, advisorMemberId: seller.memberId, status: 'DRAFT', version: 2, createdAt: '2026-01-01T00:00:00.000Z',
      calculatorRuns: [], suitabilityNotes: '', recommended: [], missing: ['recommendation', 'customerChoice'],
      scope: { evaluatedOn: '2026-01-01', entityType: 'IMF' },
    });
    const shown = res.body.scope.versionIdsShown as string[];
    expect(shown).toContain(V.term);
    expect(shown).not.toContain(V.outOfScope);
    expect(shown).not.toContain(V.health);
    expect(res.body.scope.disclosure).toBe('Showing plans from your tied insurers only: HDFC Life, ICICI Prudential Life. This disclosure appears on shared comparisons.');
    expect(res.body.scope.excludedCount).toBeGreaterThan(5);
    expect(res.body.shownProducts).toContainEqual({ versionId: V.term, productName: 'Click 2 Protect Supreme', insurerName: 'HDFC Life', line: 'LIFE', category: 'TERM' });
    expect(shown.length).toBe(res.body.shownProducts.length);
  });

  it('AC-M06-04 an opportunity of a different party is refused with party_mismatch', async () => {
    const other = await opportunityFor(t, seller);

    const res = await start({ partyId: opp.partyId, opportunityId: other.opportunityId });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('party_mismatch');
  });

  it('AC-M06-04 recommending an in-scope version returns names; a product outside the shown scope is 403 product_out_of_scope and not recorded', async () => {
    const { id } = await started();

    const outOfScope = await recommend(id, V.outOfScope);
    const health = await recommend(id, V.health);
    const ok = await recommend(id);

    expect(outOfScope.status).toBe(403);
    expect(outOfScope.body.code).toBe('product_out_of_scope');
    expect(health.status).toBe(403);
    expect(ok.status).toBe(200);
    expect(ok.body.recommended).toEqual([{ versionId: V.term, rationale: RATIONALE, productName: 'Click 2 Protect Supreme', insurerName: 'HDFC Life' }]);
    expect(ok.body.missing).toEqual(['customerChoice']);
  });

  it('AC-M06-04 a rationale shorter than 10 characters is 400 and a PAN in it is 422', async () => {
    const { id } = await started();

    const short = await recommend(id, V.term, 'too short');
    const pan = await recommend(id, V.term, 'Customer PAN ABCDE1234F supports the cover');

    expect(short.status).toBe(400);
    expect(short.body.code).toBe('invalid_rationale');
    expect(pan.status).toBe(422);
    expect(pan.body.code).toBe('sensitive_content_not_allowed');
    expect((await current(id)).recommended).toEqual([]);
  });

  it('AC-M06-04 choosing a product that was not recommended needs a reason (400 choice_reason_required); a recommended choice does not', async () => {
    const { id } = await started();
    await recommend(id, V.term);

    const noReason = await choose(id, { versionId: V.savings });
    const withReason = await choose(id, { versionId: V.savings, reasonIfDifferent: 'Customer wants guaranteed maturity benefit' });
    const recommended = await choose(id, { versionId: V.term });

    expect(noReason.status).toBe(400);
    expect(noReason.body.code).toBe('choice_reason_required');
    expect(withReason.status).toBe(200);
    expect(withReason.body.customerChoice).toEqual({ versionId: V.savings, reasonIfDifferent: 'Customer wants guaranteed maturity benefit', productName: 'Sanchay Plus', insurerName: 'HDFC Life' });
    expect(recommended.status).toBe(200);
    expect(recommended.body.customerChoice).toEqual({ versionId: V.term, productName: 'Click 2 Protect Supreme', insurerName: 'HDFC Life' });
  });

  it('AC-M06-04 customer-choice and notes need If-Match: missing is 400, stale is 412 and the record is unchanged', async () => {
    const { id, version } = await started();
    await recommend(id);

    const missing = await http.put(`/api/v1/advice-records/${id}/notes`, { text: 'Prefers annual premium' });
    const staleChoice = await choose(id, { versionId: V.term }, version);
    const staleNotes = await http.put(`/api/v1/advice-records/${id}/notes`, { text: 'Prefers annual premium' }, `"v${version}"`);

    expect(missing.status).toBe(400);
    expect(missing.body.code).toBe('if_match_required');
    expect(staleChoice.status).toBe(412);
    expect(staleChoice.body.code).toBe('version_mismatch');
    expect(staleNotes.status).toBe(412);
    const after = await current(id);
    expect(after.customerChoice).toBeUndefined();
    expect(after.suitabilityNotes).toBe('');
  });

  it('AC-M06-04 notes are saved with the current version and a PAN in them is refused', async () => {
    const { id } = await started();

    const pan = await http.put(`/api/v1/advice-records/${id}/notes`, { text: 'PAN ABCDE1234F' }, `"v${(await current(id)).version}"`);
    const ok = await http.put(`/api/v1/advice-records/${id}/notes`, { text: 'Prefers annual premium' }, `"v${(await current(id)).version}"`);

    expect(pan.status).toBe(422);
    expect(pan.body.code).toBe('sensitive_content_not_allowed');
    expect(ok.status).toBe(200);
    expect(ok.body.suitabilityNotes).toBe('Prefers annual premium');
    expect(ok.body.version).toBe(3);
  });

  it('AC-M06-04 finalising an incomplete record is 422 advice_incomplete naming what is missing', async () => {
    const { id } = await started();

    const empty = await http.post(`/api/v1/advice-records/${id}/finalisation`);
    await recommend(id);
    const noChoice = await http.post(`/api/v1/advice-records/${id}/finalisation`);

    expect(empty.status).toBe(422);
    expect(empty.body.code).toBe('advice_incomplete');
    expect(empty.body.missing).toEqual(['recommendation', 'customerChoice']);
    expect(noChoice.status).toBe(422);
    expect(noChoice.body.missing).toEqual(['customerChoice']);
    expect((await current(id)).status).toBe('DRAFT');
  });

  it('AC-M06-04 finalising emits advice.record.finalised with counts and an audit entry, and shows nothing missing', async () => {
    const { id } = await started();
    await recommend(id);
    await choose(id, { versionId: V.term });
    t.clock.advance(60_000);

    const res = await http.post(`/api/v1/advice-records/${id}/finalisation`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'FINALISED', finalisedAt: '2026-01-01T00:01:00.000Z', missing: [] });
    expect(eventData(t, 'advice.record.finalised')).toEqual([
      { adviceRecordId: id, partyId: opp.partyId, opportunityId: opp.opportunityId, recommendedCount: 1, choseRecommended: true },
    ]);
    expect(auditActions(t, id)).toContain('advice.record.finalised');
  });

  it('AC-M06-04 choseRecommended is false when the customer chose another product', async () => {
    const { id } = await started();
    await recommend(id);
    await choose(id, { versionId: V.savings, reasonIfDifferent: 'Wants maturity benefit' });

    await http.post(`/api/v1/advice-records/${id}/finalisation`);

    expect(eventData(t, 'advice.record.finalised')[0]).toMatchObject({ recommendedCount: 1, choseRecommended: false });
  });

  it('AC-M06-04 after finalisation every mutation is 422 advice_finalised and the record is unchanged', async () => {
    const { id } = await started();
    await recommend(id);
    await choose(id, { versionId: V.term });
    await http.post(`/api/v1/advice-records/${id}/finalisation`);
    const before = await current(id);
    const version = `"v${before.version}"`;

    const results = await Promise.all([
      recommend(id, V.term, 'A different rationale for the same product'),
      http.post(`/api/v1/advice-records/${id}/calculator-runs`, { calculator: 'floater', input: FLOATER_INPUT }),
      http.put(`/api/v1/advice-records/${id}/customer-choice`, { versionId: V.term }, version),
      http.put(`/api/v1/advice-records/${id}/notes`, { text: 'late note' }, version),
      http.post(`/api/v1/advice-records/${id}/finalisation`),
    ]);

    expect(results.map((r) => [r.status, r.body.code])).toEqual(Array(5).fill([422, 'advice_finalised']));
    expect(await current(id)).toEqual(before);
  });

  it('AC-M06-04 a calculator run attached to the record keeps inputs, outputs and the assumptions version, and is saved for the party', async () => {
    const { id } = await started();
    t.clock.advance(5_000);

    const res = await http.post(`/api/v1/advice-records/${id}/calculator-runs`, { calculator: 'floater', input: FLOATER_INPUT });
    const unknown = await http.post(`/api/v1/advice-records/${id}/calculator-runs`, { calculator: 'crystal-ball', input: {} });

    expect(res.status).toBe(200);
    expect(res.body.calculatorRuns).toHaveLength(1);
    expect(res.body.calculatorRuns[0]).toMatchObject({
      calculator: 'floater', inputs: FLOATER_INPUT, assumptionsVersion: '2026.1', ranAt: '2026-01-01T00:00:05.000Z',
      outputs: { result: { floaterPaise: 100_000_000, individualTotalPaise: 200_000_000, recommendation: 'FLOATER' }, assumptionsVersion: '2026.1' },
    });
    expect(unknown.status).toBe(404);
    expect(unknown.body.code).toBe('calculator_not_found');
    const principal = { userRef: 'user_001', tenantId: 'ten_acme', memberId: seller.memberId, orgUnitId: 'ou_root', roles: ['SALESPERSON'], realm: 'customers' as const };
    const saved = await t.app.get(CalculatorService).runsFor(principal, opp.partyId);
    expect(saved.map((r) => r.calculator)).toEqual(['floater']);
  });

  it('AC-M06-04 an advice record without an opportunity is scoped through its party', async () => {
    const res = await start({ partyId: opp.partyId });

    expect(res.status).toBe(201);
    expect(res.body.opportunityId).toBeUndefined();
    expect((await http.get(`/api/v1/advice-records/${res.body.id}`)).status).toBe(200);
  });

  it('AC-M06-10 another salesperson, another tenant and a missing id get 404 on every advice route; compliance can read but not write', async () => {
    const { id, version } = await started();
    const stranger = await setupSellerWithRouting(t, 'advice_stranger');
    const outsider = api(t, stranger.token);
    const otherTenant = api(t, adminToken('ten_zen'), 'zen.iap.test');

    const attempts = async (client: Api) => Promise.all([
      client.get(`/api/v1/advice-records/${id}`),
      client.post(`/api/v1/advice-records/${id}/recommendations`, { versionId: V.term, rationale: RATIONALE }),
      client.post(`/api/v1/advice-records/${id}/calculator-runs`, { calculator: 'floater', input: FLOATER_INPUT }),
      client.put(`/api/v1/advice-records/${id}/notes`, { text: 'x' }, `"v${version}"`),
      client.post(`/api/v1/advice-records/${id}/finalisation`),
    ]);

    for (const client of [outsider, otherTenant]) {
      expect((await attempts(client)).map((r) => [r.status, r.body.code])).toEqual(Array(5).fill([404, 'advice_record_not_found']));
    }
    expect((await http.get('/api/v1/advice-records/adv_missing')).status).toBe(404);
    expect((await start()).status).toBe(201);
    expect((await api(t, stranger.token).post('/api/v1/advice-records', { partyId: opp.partyId })).status).toBe(404);
    const compliance = api(t, complianceToken());
    expect((await compliance.get(`/api/v1/advice-records/${id}`)).status).toBe(200);
    expect((await compliance.post(`/api/v1/advice-records/${id}/recommendations`, { versionId: V.term, rationale: RATIONALE })).status).toBe(403);
    expect((await compliance.post('/api/v1/advice-records', { partyId: opp.partyId })).status).toBe(403);
    expect((await api(t, adminToken()).get(`/api/v1/advice-records/${id}`)).status).toBe(200);
    expect((await current(id)).recommended).toEqual([]);
  });
});
