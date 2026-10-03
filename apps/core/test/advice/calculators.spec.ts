import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { AdviceModule } from '../../src/modules/advice/advice.module';
import { CalculatorService } from '../../src/modules/advice/application/calculator.service';
import { NotFoundError } from '../../src/kernel/errors/domain-errors';
import { Principal } from '../../src/kernel/tenancy/principal';
import { createTestApp, TestApp } from '../support/test-app';
import { setupSellerWithRouting } from '../crm/fixtures';
import { Seller, api, complianceToken, opportunityFor, setupTenant } from './fixtures';

const LAKH = 10_000_000;

const principalOf = (s: Seller): Principal => ({ userRef: 'user_001', tenantId: 'ten_acme', memberId: s.memberId, orgUnitId: 'ou_root', roles: ['SALESPERSON'], realm: 'customers' });

/** AC-M06-01/02/03 calculators over HTTP, saved runs and record scope. */
describe('AC-M06-01/02/03 Calculators', () => {
  let t: TestApp;
  let seller: Seller;

  beforeEach(async () => {
    t = await createTestApp({ imports: [AdviceModule] });
    seller = await setupTenant(t);
  });
  afterEach(async () => t.close());

  it('AC-M06-01 protection gap returns HLV, recommended cover and gap rounded up to ₹1 lakh, with the assumptions version', async () => {
    const res = await api(t, seller.token).post('/api/v1/calculators/protection-gap/runs', {
      input: { annualIncomePaise: 12 * LAKH, annualExpensesPaise: 4 * LAKH, yearsToRetire: 25, liabilitiesPaise: 30 * LAKH, existingCoverPaise: 50 * LAKH, liquidAssetsPaise: 5 * LAKH },
    });

    expect(res.status).toBe(200);
    expect(res.body.result).toEqual({ humanLifeValuePaise: 129 * LAKH, recommendedCoverPaise: 159 * LAKH, gapPaise: 104 * LAKH });
    expect(res.body.assumptionsVersion).toBe('2026.1');
  });

  it('AC-M06-01 protection gap is zero when existing cover already suffices', async () => {
    const res = await api(t, seller.token).post('/api/v1/calculators/protection-gap/runs', {
      input: { annualIncomePaise: 12 * LAKH, annualExpensesPaise: 4 * LAKH, yearsToRetire: 25, liabilitiesPaise: 30 * LAKH, existingCoverPaise: 200 * LAKH, liquidAssetsPaise: 5 * LAKH },
    });

    expect(res.status).toBe(200);
    expect(res.body.result.gapPaise).toBe(0);
  });

  it('AC-M06-02 retirement, child goal, health sum insured and floater return their reference results with the assumptions version', async () => {
    const http = api(t, seller.token);

    const retirement = await http.post('/api/v1/calculators/retirement/runs', { input: { currentAge: 30, retireAge: 60, monthlyExpensePaise: 5_000_000, existingCorpusPaise: 10 * LAKH, monthlySipPaise: 1_000_000 } });
    const child = await http.post('/api/v1/calculators/child-goal/runs', { input: { goal: 'EDUCATION', currentCostPaise: 20 * LAKH, yearsToGoal: 15, savedPaise: 2 * LAKH } });
    const health = await http.post('/api/v1/calculators/health-sum-insured/runs', { input: { cityTier: 1, ages: [30], existingCoverPaise: 0, preExisting: false } });
    const floater = await http.post('/api/v1/calculators/floater/runs', { input: { cityTier: 2, members: [{ age: 35 }, { age: 33 }, { age: 5 }] } });

    expect(retirement.body.result).toEqual({ corpusNeededPaise: 7_714_847_900, projectedPaise: 3_824_232_900, shortfallPaise: 3_890_615_000, monthlySipNeededPaise: 1_871_200 });
    expect(child.body.result).toEqual({ futureCostPaise: 835_449_700, shortfallPaise: 751_904_800, monthlySipNeededPaise: 1_872_200 });
    expect(health.body.result.recommendedPaise).toBe(15 * LAKH);
    expect(floater.body.result).toEqual({ floaterPaise: 10 * LAKH, individualTotalPaise: 30 * LAKH, recommendation: 'FLOATER' });
    expect([retirement, child, health, floater].map((r) => r.body.assumptionsVersion)).toEqual(['2026.1', '2026.1', '2026.1', '2026.1']);
  });

  it('AC-M06-02 invalid inputs return 400 with a field error per bad field', async () => {
    const res = await api(t, seller.token).post('/api/v1/calculators/retirement/runs', {
      input: { currentAge: 60, retireAge: 60, monthlyExpensePaise: 1, existingCorpusPaise: 0, monthlySipPaise: 0 },
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('invalid_calculator_input');
    expect(res.body.errors.map((e: { path: string; code: string }) => `${e.path}:${e.code}`)).toEqual(['retireAge:retire_age_not_after_current_age']);
  });

  it('AC-M06-02 an unknown calculator is 404 and unknown body fields are 400', async () => {
    const http = api(t, seller.token);

    const unknown = await http.post('/api/v1/calculators/crystal-ball/runs', { input: {} });
    const extra = await http.post('/api/v1/calculators/floater/runs', { input: {}, tenantId: 'ten_zen' });

    expect(unknown.status).toBe(404);
    expect(unknown.body.code).toBe('calculator_not_found');
    expect(extra.status).toBe(400);
    expect(extra.body.code).toBe('validation_failed');
  });

  it('AC-M06-03 runs saved against a party are listed for that party only, newest first, with the assumptions version', async () => {
    const mine = await opportunityFor(t, seller);
    const other = await opportunityFor(t, seller);
    const http = api(t, seller.token);
    const floaterInput = { cityTier: 2, members: [{ age: 35 }, { age: 33 }] };
    await http.post('/api/v1/calculators/floater/runs', { input: floaterInput, partyId: mine.partyId });
    await http.post('/api/v1/calculators/health-sum-insured/runs', { input: { cityTier: 1, ages: [30], existingCoverPaise: 0, preExisting: false }, partyId: mine.partyId });
    await http.post('/api/v1/calculators/floater/runs', { input: floaterInput, partyId: other.partyId });
    await http.post('/api/v1/calculators/floater/runs', { input: floaterInput });

    const runs = await t.app.get(CalculatorService).runsFor(principalOf(seller), mine.partyId);

    expect(runs.map((r) => r.calculator)).toEqual(['health-sum-insured', 'floater']);
    expect(runs.every((r) => r.partyId === mine.partyId && r.assumptionsVersion === '2026.1' && r.ranBy === seller.memberId)).toBe(true);
    expect(runs[1].inputs).toEqual(floaterInput);
    expect(runs[1].outputs).toMatchObject({ result: { recommendation: 'FLOATER' }, assumptionsVersion: '2026.1' });
  });

  it('AC-M06-10 saving a run for a party outside the record scope is 404 and nothing is stored; the service lists nothing for it', async () => {
    const mine = await opportunityFor(t, seller);
    const stranger = await setupSellerWithRouting(t, 'advice_stranger');

    const res = await api(t, stranger.token).post('/api/v1/calculators/floater/runs', { input: { cityTier: 2, members: [{ age: 35 }] }, partyId: mine.partyId });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('party_not_found');
    await expect(t.app.get(CalculatorService).runsFor(principalOf(stranger), mine.partyId)).rejects.toBeInstanceOf(NotFoundError);
    expect(await t.app.get(CalculatorService).runsFor(principalOf(seller), mine.partyId)).toEqual([]);
  });

  it('AC-M06-10 the calculators need advice.calculate: a compliance reviewer is refused and a run emits the runs counter', async () => {
    const compliance = await api(t, complianceToken()).post('/api/v1/calculators/floater/runs', { input: { cityTier: 2, members: [{ age: 35 }] } });
    expect(compliance.status).toBe(403);

    await api(t, seller.token).post('/api/v1/calculators/floater/runs', { input: { cityTier: 2, members: [{ age: 35 }] } });
    expect(t.metrics.counter('advice_calculator_runs_total', 'Calculator runs', ['calculator']).get({ calculator: 'floater' })).toBe(1);
  });
});
