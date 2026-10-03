import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError, ValidationError } from '../../../kernel/errors/domain-errors';
import { Insurer, Product } from '../domain/catalogue';
import { ProductVersion, ProductVersionProps } from '../domain/product-version';
import { ResearchSummary } from '../domain/research';
import { CATALOGUE_REPOSITORY, CatalogueRepository, Transaction } from './ports';
import { CatalogueContext } from './catalogue-context';

/** Operator writes run in the platform transaction scope: the catalogue has no tenant. */
export const PLATFORM_TENANT_ID = 'platform';

export type NewVersion = Omit<ProductVersionProps, 'id' | 'status' | 'lockedAt' | 'insurerId' | 'line'>;
export type VersionPatch = Parameters<ProductVersion['edit']>[0];

/** Operator catalogue maintenance (W09). Every change is audited; activation, withdrawal and research emit events. */
@Injectable()
export class CatalogueAdminService {
  constructor(
    @Inject(CATALOGUE_REPOSITORY) private readonly catalogue: CatalogueRepository,
    private readonly ctx: CatalogueContext,
  ) {}

  upsertInsurer(insurer: Insurer): Promise<Insurer> {
    return this.platform(async (tx) => {
      const before = (await this.catalogue.insurers()).find((i) => i.id === insurer.id);
      await this.catalogue.saveInsurer(insurer);
      await this.audit(tx, 'catalogue.insurer.upserted', 'insurer', insurer.id, before, insurer);
      return insurer;
    });
  }

  upsertProduct(product: Product): Promise<Product> {
    return this.platform(async (tx) => {
      await this.requireInsurer(product.insurerId);
      const before = (await this.catalogue.products()).find((p) => p.id === product.id);
      if (before && (before.insurerId !== product.insurerId || before.line !== product.line)) {
        throw new ValidationError('product_identity_immutable', 'A product cannot move to another insurer or line');
      }
      await this.catalogue.saveProduct(product);
      await this.audit(tx, 'catalogue.product.upserted', 'product', product.id, before, product);
      return product;
    });
  }

  /** Insurer and line always come from the product, never from the request. */
  createDraft(input: NewVersion): Promise<ProductVersionProps> {
    return this.platform(async (tx) => {
      const product = (await this.catalogue.products()).find((p) => p.id === input.productId);
      if (!product) throw new NotFoundError('product', input.productId);
      const clash = (await this.catalogue.versions({ productId: product.id })).some((v) => v.wordingVersion === input.wordingVersion);
      if (clash) throw new ValidationError('duplicate_wording_version', 'This product already has a version with that wording version');
      const version = ProductVersion.draft({ ...input, id: this.ctx.ids.next('pv'), insurerId: product.insurerId, line: product.line });
      await this.catalogue.saveVersion(version);
      await this.audit(tx, 'catalogue.version.drafted', 'product_version', version.id, undefined, version.props);
      return { ...version.props };
    });
  }

  edit(versionId: string, patch: VersionPatch): Promise<ProductVersionProps> {
    return this.change(versionId, 'catalogue.version.edited', (v) => v.edit(patch));
  }

  activate(versionId: string): Promise<ProductVersionProps> {
    return this.change(versionId, 'catalogue.version.activated', (v) => v.activate(), 'catalogue.product_version.activated');
  }

  withdraw(versionId: string, on?: string): Promise<ProductVersionProps> {
    return this.change(versionId, 'catalogue.version.withdrawn', (v) => v.withdraw(on ?? this.ctx.today()), 'catalogue.product_version.withdrawn');
  }

  /** Research is reviewed against the version's current wording; a later wording change makes it stale (M07). */
  saveResearch(versionId: string, input: Omit<ResearchSummary, 'versionId' | 'reviewedWordingVersion' | 'reviewedAt'>): Promise<ResearchSummary> {
    return this.platform(async (tx) => {
      const version = await this.require(versionId);
      const summary: ResearchSummary = { ...input, versionId, reviewedWordingVersion: version.props.wordingVersion, reviewedAt: this.ctx.clock.now().toISOString() };
      await this.catalogue.saveResearch(summary);
      await this.ctx.recorder.record(tx, {
        event: { type: 'catalogue.research.updated', subject: versionId, data: { versionId, wordingVersion: summary.reviewedWordingVersion } },
        audit: { action: 'catalogue.research.updated', entityType: 'research_summary', entityId: versionId, after: { sourceRef: summary.sourceRef, sourceDate: summary.sourceDate } },
      });
      return summary;
    });
  }

  /** M06 `quote.option.created`: a version that has been quoted can no longer be edited (only withdrawn). */
  lock(tx: Transaction, versionId: string): Promise<void> {
    return this.require(versionId).then(async (version) => {
      if (version.lockedAt) return;
      version.lock(this.ctx.clock.now());
      await this.catalogue.saveVersion(version);
      await this.audit(tx, 'catalogue.version.locked', 'product_version', versionId, undefined, { lockedAt: version.lockedAt });
    });
  }

  private change(versionId: string, action: string, apply: (v: ProductVersion) => void, eventType?: string): Promise<ProductVersionProps> {
    return this.platform(async (tx) => {
      const version = await this.require(versionId);
      const before = { ...version.props };
      apply(version);
      await this.catalogue.saveVersion(version);
      const after = { ...version.props };
      await this.ctx.recorder.record(tx, {
        ...(eventType ? { event: { type: eventType, subject: versionId, data: { versionId, productId: after.productId, insurerId: after.insurerId, status: after.status } } } : {}),
        audit: { action, entityType: 'product_version', entityId: versionId, before, after },
      });
      this.ctx.logger.info(action, 'Product version changed', { versionId, status: after.status });
      return after;
    });
  }

  private async require(versionId: string): Promise<ProductVersion> {
    const version = await this.catalogue.getVersion(versionId);
    if (!version) throw new NotFoundError('productVersion', versionId);
    return version;
  }

  private async requireInsurer(insurerId: string): Promise<void> {
    if (!(await this.catalogue.insurers()).some((i) => i.id === insurerId)) throw new NotFoundError('insurer', insurerId);
  }

  private audit(tx: Transaction, action: string, entityType: string, entityId: string, before: unknown, after: unknown): Promise<void> {
    return this.ctx.recorder.record(tx, { audit: { action, entityType, entityId, before, after } });
  }

  private platform<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.ctx.uow.run(PLATFORM_TENANT_ID, work);
  }
}
