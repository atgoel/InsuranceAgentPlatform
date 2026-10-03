import { FixedClock } from '../../../kernel/domain/clock';
import { Product } from '../../catalogue/domain/catalogue';
import { PosCatalogueReader } from '../../catalogue/application/ports';
import { CrmContext } from './crm-context';
import { CataloguePosEligibility } from './routing.service';

class StubReader implements PosCatalogueReader {
  dates: string[] = [];
  constructor(private readonly categories: Array<Product['category']>) {}
  async posEligibleCategories(date: string): Promise<ReadonlySet<Product['category']>> {
    this.dates.push(date);
    return new Set(this.categories);
  }
}

const ctx = (clock: FixedClock) => ({ clock }) as unknown as CrmContext;

describe('AC-M04-07 CataloguePosEligibility (POSPs never receive non-POS products)', () => {
  it('AC-M04-07 maps product interest to catalogue categories', async () => {
    const policy = new CataloguePosEligibility(new StubReader(['TERM', 'STANDARD_HEALTH']), ctx(new FixedClock(new Date('2026-10-03T06:00:00Z'))));
    expect(await policy.isPosEligible('TERM_LIFE')).toBe(true);
    expect(await policy.isPosEligible('HEALTH')).toBe(true);
    expect(await policy.isPosEligible('HEALTH_FLOATER')).toBe(false);
    expect(await policy.isPosEligible('SAVINGS_LIFE')).toBe(false);
    expect(await policy.isPosEligible('OTHER')).toBe(false);
  });

  it('AC-M04-07 asks the catalogue for the current date', async () => {
    const reader = new StubReader([]);
    await new CataloguePosEligibility(reader, ctx(new FixedClock(new Date('2026-10-03T06:00:00Z')))).isPosEligible('MOTOR');
    expect(reader.dates).toEqual(['2026-10-03']);
  });
});
