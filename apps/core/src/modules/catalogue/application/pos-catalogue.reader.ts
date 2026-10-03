import { Inject, Injectable } from '@nestjs/common';
import { Product } from '../domain/catalogue';
import { ProductVersion } from '../domain/product-version';
import { CATALOGUE_REPOSITORY, CatalogueRepository, PosCatalogueReader } from './ports';

/** Derives POS-eligible categories from version flags, so POSP routing follows the catalogue rather than a hard-coded list. */
@Injectable()
export class DefaultPosCatalogueReader implements PosCatalogueReader {
  constructor(@Inject(CATALOGUE_REPOSITORY) private readonly catalogue: CatalogueRepository) {}

  async posEligibleCategories(date: string): Promise<ReadonlySet<Product['category']>> {
    const [versions, products, insurers] = await Promise.all([this.catalogue.versions({ status: 'active' }), this.catalogue.products(), this.catalogue.insurers()]);
    const activeInsurers = new Set(insurers.filter((i) => i.active).map((i) => i.id));
    const categoryOf = new Map(products.map((p) => [p.id, p.category]));
    const categories = new Set<Product['category']>();
    for (const v of versions) {
      const category = categoryOf.get(v.productId);
      if (category && v.posEligible && activeInsurers.has(v.insurerId) && ProductVersion.restore(v).isEffective(date)) categories.add(category);
    }
    return categories;
  }
}
