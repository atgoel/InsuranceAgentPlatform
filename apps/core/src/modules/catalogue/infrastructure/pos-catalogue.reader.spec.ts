import { ProductVersion } from '../domain/product-version';
import { InMemoryCatalogueRepository } from './in-memory-catalogue.repository';
import { DefaultPosCatalogueReader } from '../application/pos-catalogue.reader';

describe('AC-M05-02 DefaultPosCatalogueReader (POS flags published to M04 routing)', () => {
  it('AC-M05-02 lists categories with an active, effective POS-eligible version of an active insurer', async () => {
    const reader = new DefaultPosCatalogueReader(new InMemoryCatalogueRepository());
    // MOTOR comes from ICICI Lombard (active); HDFC ERGO's motor version is POS-eligible but its insurer is inactive.
    expect([...(await reader.posEligibleCategories('2026-10-03'))].sort()).toEqual(['HEALTH_FLOATER', 'MOTOR', 'STANDARD_HEALTH', 'TERM']);
  });

  it('AC-M05-03 a withdrawn or not-yet-effective version no longer makes its category POS-eligible', async () => {
    const repo = new InMemoryCatalogueRepository();
    const saral = await repo.getVersion('pv_hdfc_saral_v1');
    if (!saral) throw new Error('seed missing');
    const reader = new DefaultPosCatalogueReader(repo);
    expect((await reader.posEligibleCategories('2025-03-31')).has('TERM')).toBe(false); // seed versions start 2025-04-01
    expect((await reader.posEligibleCategories('2025-04-01')).has('TERM')).toBe(true);
    saral.withdraw('2026-06-30');
    await repo.saveVersion(saral);
    expect((await reader.posEligibleCategories('2026-06-30')).has('TERM')).toBe(false); // withdrawn versions are never effective
  });

  it('AC-M05-02 flipping a version flag changes eligibility without code changes', async () => {
    const repo = new InMemoryCatalogueRepository();
    const sanchay = (await repo.versions()).find((v) => v.id === 'pv_hdfc_sanchay_v1');
    if (!sanchay) throw new Error('seed missing');
    await repo.saveVersion(ProductVersion.restore({ ...sanchay, posEligible: true }));
    expect((await new DefaultPosCatalogueReader(repo).posEligibleCategories('2026-10-03')).has('SAVINGS')).toBe(true);
  });
});
