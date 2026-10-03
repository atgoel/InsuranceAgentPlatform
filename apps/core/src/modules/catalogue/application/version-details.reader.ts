import { Inject, Injectable } from '@nestjs/common';
import { CATALOGUE_REPOSITORY, CatalogueQueryFacade, CatalogueRepository, VersionDetail } from './ports';

/** Version → product and insurer names for M06 views; unknown ids are left out. */
@Injectable()
export class VersionDetailsReader implements CatalogueQueryFacade {
  constructor(@Inject(CATALOGUE_REPOSITORY) private readonly catalogue: CatalogueRepository) {}

  async versionDetails(versionIds: readonly string[]): Promise<VersionDetail[]> {
    if (versionIds.length === 0) return [];
    const wanted = new Set(versionIds);
    const [versions, products, insurers] = await Promise.all([this.catalogue.versions(), this.catalogue.products(), this.catalogue.insurers()]);
    const productById = new Map(products.map((p) => [p.id, p]));
    const insurerById = new Map(insurers.map((i) => [i.id, i]));
    return versions
      .filter((v) => wanted.has(v.id))
      .map((v) => {
        const product = productById.get(v.productId);
        return {
          versionId: v.id,
          productId: v.productId,
          productName: product?.name ?? v.productId,
          insurerId: v.insurerId,
          insurerName: insurerById.get(v.insurerId)?.name ?? v.insurerId,
          line: v.line,
          category: product?.category ?? 'OTHER',
        };
      });
  }
}
