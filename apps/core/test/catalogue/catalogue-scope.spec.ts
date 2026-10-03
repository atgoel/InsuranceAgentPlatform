import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { CatalogueModule } from '../../src/modules/catalogue/catalogue.module';
import { DistributionModule } from '../../src/modules/distribution/distribution.module';
import { createTestApp, TestApp } from '../support/test-app';
import { tokenFor } from '../support/tokens';
import { HOST, adminToken, sellerToken, setEntityType, tieUps } from './fixtures';
import { UNIT_OF_WORK } from '../../src/kernel/tokens';
import { UnitOfWork } from '../../src/kernel/persistence/unit-of-work';
import { Principal } from '../../src/kernel/tenancy/principal';
import { COMPARISON_SCOPE_FACADE, ComparisonScopeFacade } from '../../src/modules/catalogue/application/ports';

interface ScopedVersion { versionId: string; insurerId: string; productName: string; insurerName: string }
interface Scope { versions: ScopedVersion[]; insurerIds: string[]; excluded: Array<{ versionId: string; reason: string }>; disclosure: string }
interface Row { versionId: string; insurerName: string; productName: string; inScope: boolean; exclusion?: string; status: string }

const TIED_DISCLOSURE = 'Showing plans from your tied insurers only: HDFC Life, Star Health. This disclosure appears on shared comparisons.';
const POSP_DISCLOSURE = 'POSP view: only POSP-eligible products are shown. Other plans need an ISP or employee salesperson.';

/** AC-M05-02/03/04/05/08: comparison scope (LA-6) through the API, with inputs from M01 tie-ups and M02 selling scope. */
describe('AC-M05-02/03/04/05/08 Comparison scope over HTTP', () => {
  let t: TestApp;
  const evaluate = async (token: string, body: object = {}, host = HOST): Promise<Scope> => {
    const res = await t.http.post('/api/v1/catalogue/comparison-scopes/evaluations').set('Host', host).set('Authorization', `Bearer ${token}`).send(body);
    expect(res.status).toBe(200);
    return res.body as Scope;
  };
  const ids = (s: Scope) => s.versions.map((v) => v.versionId).sort();
  const reasonOf = (s: Scope, versionId: string) => s.excluded.find((e) => e.versionId === versionId)?.reason;
  const table = async (token = adminToken(), query = '', host = HOST): Promise<Row[]> => {
    const res = await t.http.get(`/api/v1/catalogue/products${query}`).set('Host', host).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    return res.body.items as Row[];
  };

  beforeEach(async () => {
    t = await createTestApp({ imports: [CatalogueModule, DistributionModule] });
  });
  afterEach(async () => t.close());

  describe('IMF (tied insurers)', () => {
    it('AC-M05-02 an IMF employee sees only the tied insurers’ effective versions, with names and the tied disclosure', async () => {
      await tieUps(t, [['ins_hdfc_life', 'LIFE'], ['ins_star', 'HEALTH']]);
      const { token } = await sellerToken(t, 'EMPLOYEE');
      const scope = await evaluate(token);
      expect(ids(scope)).toEqual(['pv_hdfc_sanchay_v1', 'pv_hdfc_saral_v1', 'pv_hdfc_term_v1', 'pv_star_arogya_v1', 'pv_star_comp_v1', 'pv_star_floater_v1']);
      expect(scope.insurerIds).toEqual(['ins_hdfc_life', 'ins_star']);
      expect(scope.versions.find((v) => v.versionId === 'pv_hdfc_term_v1')).toMatchObject({ productName: 'Click 2 Protect Supreme', insurerName: 'HDFC Life' });
      expect(scope.disclosure).toBe(TIED_DISCLOSURE);
    });

    it('AC-M05-02 a tie-up for one line does not bring in the same insurer’s other lines, and the line filter narrows', async () => {
      await tieUps(t, [['ins_icici_lombard', 'GENERAL']]);
      const scope = await evaluate(adminToken());
      expect(ids(scope)).toEqual(['pv_icicil_motor_v1']);
      expect(ids(await evaluate(adminToken(), { line: 'HEALTH' }))).toEqual([]);
    });

    it('AC-M05-03 each exclusion carries the first failing reason: inactive insurer, not effective, not tied', async () => {
      await tieUps(t, [['ins_star', 'HEALTH'], ['ins_hdfc_ergo', 'GENERAL']]);
      const scope = await evaluate(adminToken());
      expect(reasonOf(scope, 'pv_ergo_motor_v1')).toBe('insurer_inactive');
      expect(reasonOf(scope, 'pv_star_comp_v0')).toBe('not_effective');
      expect(reasonOf(scope, 'pv_icici_term_v1')).toBe('insurer_not_tied');
      expect(scope.versions.length + scope.excluded.length).toBe(14);
    });

    it('AC-M05-04 with no tie-ups nothing is in scope and the disclosure says none configured', async () => {
      const scope = await evaluate(adminToken());
      expect(scope.versions).toEqual([]);
      expect(scope.disclosure).toBe('Showing plans from your tied insurers only: none configured. This disclosure appears on shared comparisons.');
    });
  });

  describe('Salesperson scope (M02)', () => {
    it('AC-M05-02 a POSP sees only POS-eligible versions of licensed lines, with the POSP disclosure', async () => {
      await tieUps(t, [['ins_hdfc_life', 'LIFE'], ['ins_star', 'HEALTH']]);
      const { token } = await sellerToken(t, 'POSP', ['POSP_LIFE', 'POSP_GENERAL']);
      const scope = await evaluate(token);
      expect(ids(scope)).toEqual(['pv_hdfc_saral_v1', 'pv_star_arogya_v1', 'pv_star_floater_v1']);
      expect(reasonOf(scope, 'pv_hdfc_term_v1')).toBe('not_pos_eligible');
      expect(scope.disclosure).toBe(POSP_DISCLOSURE);
    });

    it('AC-M05-03 a POSP licensed for life only gets line_not_licensed for health', async () => {
      await tieUps(t, [['ins_hdfc_life', 'LIFE'], ['ins_star', 'HEALTH']]);
      const { token } = await sellerToken(t, 'POSP', ['POSP_LIFE']);
      const scope = await evaluate(token);
      expect(ids(scope)).toEqual(['pv_hdfc_saral_v1']);
      expect(reasonOf(scope, 'pv_star_floater_v1')).toBe('line_not_licensed');
    });

    it('AC-M05-03 a SALESPERSON token whose member has no active selling scope sees nothing', async () => {
      await tieUps(t, [['ins_hdfc_life', 'LIFE']]);
      const ghost = tokenFor({ tenantId: 'ten_acme', roles: ['SALESPERSON'], memberId: 'mem_unknown', orgUnitId: 'ou_root' });
      const scope = await evaluate(ghost);
      expect(scope.versions).toEqual([]);
      expect(reasonOf(scope, 'pv_hdfc_term_v1')).toBe('line_not_licensed');
    });
  });

  describe('Entity types', () => {
    it('AC-M05-02 a broker compares market-wide without tie-ups, and the disclosure lists every included insurer', async () => {
      await setEntityType(t, 'BROKER');
      const scope = await evaluate(adminToken());
      expect(scope.insurerIds).toEqual(['ins_care', 'ins_hdfc_life', 'ins_icici_lombard', 'ins_icici_pru', 'ins_niva', 'ins_star', 'ins_tata_aia']);
      expect(scope.disclosure).toBe('Broker view: comparing across all configured insurers (Care Health, HDFC Life, ICICI Lombard, ICICI Prudential Life, Niva Bupa, Star Health, Tata AIA Life). Advice is documented in the advice record.');
      expect(reasonOf(scope, 'pv_ergo_motor_v1')).toBe('insurer_inactive');
    });

    it('AC-M05-02 an individual agent sees only the appointing insurer, and versions not sold through agents are channel_not_permitted', async () => {
      await setEntityType(t, 'INDIVIDUAL_AGENT');
      await tieUps(t, [['ins_icici_pru', 'LIFE']]);
      const scope = await evaluate(adminToken());
      expect(ids(scope)).toEqual(['pv_icici_term_v1']);
      expect(reasonOf(scope, 'pv_icici_ulip_v1')).toBe('channel_not_permitted');
      expect(scope.disclosure).toBe('Agent view: only your appointing insurer for this line is shown (one insurer per line today; limits are configurable).');
    });
  });

  describe('Version detail', () => {
    it('AC-M05-05 an in-scope version returns its key facts, wording and quote requirements', async () => {
      await tieUps(t, [['ins_hdfc_life', 'LIFE']]);
      const res = await t.http.get('/api/v1/catalogue/versions/pv_hdfc_term_v1').set('Host', HOST).set('Authorization', `Bearer ${adminToken()}`);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        versionId: 'pv_hdfc_term_v1', productName: 'Click 2 Protect Supreme', insurerName: 'HDFC Life', uin: '101N183V01', inScope: true,
        quoteRequirements: ['dob', 'sum_assured'], keyFacts: [{ label: 'Cover up to age', value: '85' }, { label: 'Claim settlement', value: 'Insurer published' }],
      });
    });

    it('AC-M05-05 an out-of-scope version is a 404 indistinguishable from a missing one', async () => {
      await tieUps(t, [['ins_hdfc_life', 'LIFE']]);
      const get = (id: string) => t.http.get(`/api/v1/catalogue/versions/${id}`).set('Host', HOST).set('Authorization', `Bearer ${adminToken()}`);
      const [outOfScope, missing] = await Promise.all([get('pv_icici_term_v1'), get('pv_does_not_exist')]);
      expect([outOfScope.status, missing.status]).toEqual([404, 404]);
      expect(outOfScope.body.code).toBe('product_version_not_found');
      expect(missing.body.code).toBe('product_version_not_found');
    });
  });

  describe('assertInScope (published to M06 quotes)', () => {
    const principal = (memberId?: string): Principal => ({ userRef: 'u1', tenantId: 'ten_acme', roles: memberId ? ['SALESPERSON'] : ['TENANT_ADMIN'], memberId, realm: 'customers' });
    const assertInScope = (p: Principal, versionId: string) =>
      t.app.get<UnitOfWork>(UNIT_OF_WORK).run('ten_acme', (tx) => t.app.get<ComparisonScopeFacade>(COMPARISON_SCOPE_FACADE).assertInScope(tx, p, versionId, '2026-01-01'));

    it('AC-M05-05 passes for an in-scope version', async () => {
      await tieUps(t, [['ins_hdfc_life', 'LIFE']]);
      await expect(assertInScope(principal(), 'pv_hdfc_term_v1')).resolves.toBeUndefined();
    });

    it('AC-M05-05 rejects an out-of-scope version with 403 product_out_of_scope and the exclusion reason', async () => {
      await tieUps(t, [['ins_hdfc_life', 'LIFE']]);
      await expect(assertInScope(principal(), 'pv_icici_term_v1')).rejects.toMatchObject({ httpStatus: 403, code: 'product_out_of_scope', details: { reason: 'insurer_not_tied' } });
      const { memberId } = await sellerToken(t, 'POSP', ['POSP_LIFE']);
      await expect(assertInScope(principal(memberId), 'pv_hdfc_term_v1')).rejects.toMatchObject({ code: 'product_out_of_scope', details: { reason: 'not_pos_eligible' } });
      await expect(assertInScope(principal(), 'pv_missing')).rejects.toMatchObject({ code: 'product_out_of_scope', details: { reason: 'unknown_version' } });
    });
  });

  describe('Tenant catalogue table (W07)', () => {
    it('AC-M05-08 lists published versions with scope chips data; drafts never appear; sorted by insurer then product', async () => {
      await tieUps(t, [['ins_star', 'HEALTH']]);
      const rows = await table(adminToken(), '?line=HEALTH');
      expect(rows.map((r) => [r.versionId, r.inScope, r.exclusion ?? null])).toEqual([
        ['pv_care_supreme_v1', false, 'insurer_not_tied'],
        ['pv_niva_reassure_v1', false, 'insurer_not_tied'],
        ['pv_star_arogya_v1', true, null],
        ['pv_star_comp_v0', false, 'not_effective'],
        ['pv_star_comp_v1', true, null],
        ['pv_star_floater_v1', true, null],
      ]);
      expect(rows.find((r) => r.versionId === 'pv_star_comp_v0')?.status).toBe('withdrawn');
    });

    it('AC-M05-08 one tenant’s tie-ups never change another tenant’s scope', async () => {
      await tieUps(t, [['ins_star', 'HEALTH']]);
      const zen = tokenFor({ tenantId: 'ten_zen', roles: ['TENANT_ADMIN'] });
      const zenRows = await table(zen, '?line=HEALTH', 'zen.iap.test');
      expect(zenRows.filter((r) => r.inScope)).toEqual([]);
      expect((await table(adminToken(), '?line=HEALTH')).filter((r) => r.inScope).map((r) => r.versionId)).toEqual(['pv_star_arogya_v1', 'pv_star_comp_v1', 'pv_star_floater_v1']);
    });

    it('AC-M05-08 filters by insurer and category', async () => {
      await tieUps(t, [['ins_star', 'HEALTH']]);
      expect((await table(adminToken(), '?insurerId=ins_star&category=HEALTH_FLOATER')).map((r) => r.versionId)).toEqual(['pv_star_floater_v1']);
    });

    it('AC-M05-08 rejects unknown query parameters with 400', async () => {
      const res = await t.http.get('/api/v1/catalogue/products?tenantId=ten_zen').set('Host', HOST).set('Authorization', `Bearer ${adminToken()}`);
      expect(res.status).toBe(400);
    });
  });
});
