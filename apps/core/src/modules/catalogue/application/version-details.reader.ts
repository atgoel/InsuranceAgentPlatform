import { Inject, Injectable } from '@nestjs/common';
import { CATALOGUE_REPOSITORY, CatalogueQueryFacade, CatalogueRepository, VersionDetail } from './ports';

/** Version → product and insurer names for M06 views; unknown ids are left out. */
@Injectable()
export class VersionDetailsReader implements CatalogueQueryFacade {
  constructor(@Inject(CATALOGUE_REPOSITORY) private readonly catalogue: CatalogueRepository) {}

  async findProduct(insurerName: string, productName: string, date: string): Promise<VersionDetail | undefined> {
    const normalize = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ');
    const [insurers, products, versions] = await Promise.all([this.catalogue.insurers(), this.catalogue.products(), this.catalogue.versions({status:'active'})]);
    const insurerIds = new Set(insurers.filter(insurer => insurer.active && normalize(insurer.name) === normalize(insurerName)).map(insurer => insurer.id));
    const productIds = new Set(products.filter(product => insurerIds.has(product.insurerId) && normalize(product.name) === normalize(productName)).map(product => product.id));
    const candidates = versions.filter(version => productIds.has(version.productId) && insurerIds.has(version.insurerId) && version.effectiveFrom <= date && (version.effectiveTo === undefined || version.effectiveTo >= date));
    if(candidates.length !== 1) return undefined;
    return (await this.versionDetails([candidates[0].id]))[0];
  }

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
          keyFacts: v.keyFacts,
        };
      });
  }
}
