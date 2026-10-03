import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { CatalogueModule } from '../../src/modules/catalogue/catalogue.module';
import { DistributionModule } from '../../src/modules/distribution/distribution.module';
import { createTestApp, TestApp } from '../support/test-app';
import { operatorToken } from '../support/tokens';
import { HOST, adminToken, sellerToken, tieUps } from './fixtures';

interface ResearchItem {
  versionId: string; productName: string; insurerName: string; line: string; posEligible: boolean; summary: string; points: string[];
  sourceRef: string; sourceDate: string; stale: boolean; staleReason?: string;
}

/** AC-M05-06 research library: source and date, stale flags, in-scope versions only. Test clock: 2026-01-01. */
describe('AC-M05-06 Research library over HTTP', () => {
  let t: TestApp;
  const research = async (query = '', token = adminToken()): Promise<ResearchItem[]> => {
    const res = await t.http.get(`/api/v1/catalogue/research${query}`).set('Host', HOST).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    return res.body.items as ResearchItem[];
  };
  const brief = (items: ResearchItem[]) => items.map((i) => [i.versionId, i.stale, i.staleReason ?? null]);

  beforeEach(async () => {
    t = await createTestApp({ imports: [CatalogueModule, DistributionModule] });
  });
  afterEach(async () => t.close());

  it('AC-M05-06 returns only in-scope versions that have a summary, sorted by insurer then product, with stale flags', async () => {
    await tieUps(t, [['ins_hdfc_life', 'LIFE'], ['ins_star', 'HEALTH']]);
    expect(brief(await research())).toEqual([
      ['pv_hdfc_term_v1', false, null],
      ['pv_star_comp_v1', true, 'wording_changed'], // reviewed against wording v0; the version is v1
      ['pv_star_floater_v1', false, null],
    ]);
  });

  it('AC-M05-06 a review older than 365 days is stale', async () => {
    await tieUps(t, [['ins_care', 'HEALTH']]);
    expect(brief(await research())).toEqual([['pv_care_supreme_v1', true, 'older_than_365_days']]); // reviewed 2024-09-01
  });

  it('AC-M05-06 each item carries its source, date, points and POS flag', async () => {
    await tieUps(t, [['ins_star', 'HEALTH']]);
    const floater = (await research()).find((i) => i.versionId === 'pv_star_floater_v1');
    expect(floater).toEqual({
      versionId: 'pv_star_floater_v1', productName: 'Family Health Optima', insurerName: 'Star Health', line: 'HEALTH', posEligible: true,
      summary: 'Family floater with automatic restoration of the sum insured.',
      points: ['100% restoration once a year', 'Day-care procedures covered', 'Pre-existing diseases after 36 months'],
      sourceRef: 'Policy wording v1, section 3', sourceDate: '2025-04-01', stale: false,
    });
  });

  it('AC-M05-06 versions of non-tied insurers never appear', async () => {
    await tieUps(t, [['ins_hdfc_life', 'LIFE']]);
    expect((await research()).map((i) => i.versionId)).toEqual(['pv_hdfc_term_v1']);
  });

  it('AC-M05-06 a POSP sees research only for POS-eligible versions of licensed lines', async () => {
    await tieUps(t, [['ins_hdfc_life', 'LIFE'], ['ins_star', 'HEALTH']]);
    const { token } = await sellerToken(t, 'POSP', ['POSP_LIFE', 'POSP_GENERAL']);
    expect((await research('', token)).map((i) => i.versionId)).toEqual(['pv_star_floater_v1']);
  });

  it('AC-M05-06 filters by line and by a case-insensitive text query over product, insurer and summary', async () => {
    await tieUps(t, [['ins_hdfc_life', 'LIFE'], ['ins_star', 'HEALTH']]);
    expect((await research('?line=LIFE')).map((i) => i.versionId)).toEqual(['pv_hdfc_term_v1']);
    expect((await research('?q=hdfc')).map((i) => i.versionId)).toEqual(['pv_hdfc_term_v1']);
    expect((await research('?q=RESTORATION')).map((i) => i.versionId)).toEqual(['pv_star_floater_v1']);
    expect(await research('?q=nothing-matches')).toEqual([]);
  });

  it('AC-M05-06 rejects an unknown line with 400', async () => {
    const res = await t.http.get('/api/v1/catalogue/research?line=MARINE').set('Host', HOST).set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(400);
  });

  it('AC-M05-06 a new operator review against the current wording clears the stale flag', async () => {
    await tieUps(t, [['ins_star', 'HEALTH']]);
    const res = await t.http.put('/api/v1/ops/catalogue/versions/pv_star_comp_v1/research').set('Authorization', `Bearer ${operatorToken()}`)
      .send({ summary: 'Individual comprehensive cover, re-reviewed.', points: ['Maternity after 24 months'], sourceRef: 'Policy wording v1', sourceDate: '2025-04-01' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ versionId: 'pv_star_comp_v1', reviewedWordingVersion: 'v1', reviewedAt: '2026-01-01T00:00:00.000Z' });
    expect((await research()).find((i) => i.versionId === 'pv_star_comp_v1')).toMatchObject({ stale: false, summary: 'Individual comprehensive cover, re-reviewed.' });
  });

  it('AC-M05-06 requires authentication', async () => {
    expect((await t.http.get('/api/v1/catalogue/research').set('Host', HOST)).status).toBe(401);
  });
});
