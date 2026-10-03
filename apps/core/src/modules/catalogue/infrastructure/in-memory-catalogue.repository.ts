import { Injectable } from '@nestjs/common';
import { Insurer, LineOfBusiness, Product } from '../domain/catalogue';
import { ProductVersion, ProductVersionProps, VersionStatus } from '../domain/product-version';
import { ResearchSummary } from '../domain/research';
import { CatalogueRepository } from '../application/ports';
import { SEED_INSURERS, SEED_PRODUCTS, SEED_RESEARCH, SEED_VERSIONS } from './seed-catalogue';

const clone = <T>(value: T): T => structuredClone(value);

/** Platform-scope catalogue held in memory and seeded with the launch catalogue; one instance per application. */
@Injectable()
export class InMemoryCatalogueRepository implements CatalogueRepository {
  private readonly insurerRows = new Map(SEED_INSURERS.map((i) => [i.id, clone(i)]));
  private readonly productRows = new Map(SEED_PRODUCTS.map((p) => [p.id, clone(p)]));
  private readonly versionRows = new Map(SEED_VERSIONS.map((v) => [v.id, clone(v)]));
  private readonly researchRows = new Map(SEED_RESEARCH.map((r) => [r.versionId, clone(r)]));

  async insurers(): Promise<Insurer[]> {
    return [...this.insurerRows.values()].map(clone);
  }

  async saveInsurer(i: Insurer): Promise<void> {
    this.insurerRows.set(i.id, clone(i));
  }

  async products(filter: { insurerId?: string; line?: LineOfBusiness } = {}): Promise<Product[]> {
    return [...this.productRows.values()]
      .filter((p) => (!filter.insurerId || p.insurerId === filter.insurerId) && (!filter.line || p.line === filter.line))
      .map(clone);
  }

  async saveProduct(p: Product): Promise<void> {
    this.productRows.set(p.id, clone(p));
  }

  async versions(filter: { productId?: string; status?: VersionStatus } = {}): Promise<ProductVersionProps[]> {
    return [...this.versionRows.values()]
      .filter((v) => (!filter.productId || v.productId === filter.productId) && (!filter.status || v.status === filter.status))
      .map(clone);
  }

  async getVersion(id: string): Promise<ProductVersion | undefined> {
    const row = this.versionRows.get(id);
    return row ? ProductVersion.restore(clone(row)) : undefined;
  }

  async saveVersion(v: ProductVersion): Promise<void> {
    this.versionRows.set(v.id, clone({ ...v.props }));
  }

  async research(versionIds: readonly string[]): Promise<ResearchSummary[]> {
    return versionIds.flatMap((id) => {
      const row = this.researchRows.get(id);
      return row ? [clone(row)] : [];
    });
  }

  async saveResearch(r: ResearchSummary): Promise<void> {
    this.researchRows.set(r.versionId, clone(r));
  }
}
