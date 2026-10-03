import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../kernel/errors/domain-errors';
import { Principal } from '../../../kernel/tenancy/principal';
import { Insurer, LineOfBusiness, Product } from '../domain/catalogue';
import { ProductVersionProps } from '../domain/product-version';
import { isStale } from '../domain/research';
import { ScopeExclusion, ScopeResult } from '../domain/scope-engine';
import { CATALOGUE_REPOSITORY, CatalogueRepository, SCOPE_INPUTS_PROVIDER, ScopeInputsProvider } from './ports';
import { CatalogueContext } from './catalogue-context';
import { ComparisonScopeService } from './comparison-scope.service';

export interface CatalogueRow {
  versionId: string; productId: string; productName: string; insurerId: string; insurerName: string; line: LineOfBusiness;
  category: Product['category']; uin: string; wordingVersion: string; ispEligible: boolean; posEligible: boolean;
  status: ProductVersionProps['status']; inScope: boolean; exclusion?: ScopeExclusion;
}

export interface ResearchItem {
  versionId: string; productName: string; insurerName: string; line: LineOfBusiness; posEligible: boolean; summary: string; points: string[];
  sourceRef: string; sourceDate: string; stale: boolean; staleReason?: 'wording_changed' | 'older_than_365_days';
}

export interface CatalogueFilters { line?: LineOfBusiness; category?: Product['category']; insurerId?: string }

interface Names { insurers: Map<string, Insurer>; products: Map<string, Product> }

/** Tenant-facing catalogue reads (W07 table, M07 research library, compare). Everything is scoped by the engine. */
@Injectable()
export class CatalogueQueryService {
  constructor(
    @Inject(CATALOGUE_REPOSITORY) private readonly catalogue: CatalogueRepository,
    @Inject(SCOPE_INPUTS_PROVIDER) private readonly inputs: ScopeInputsProvider,
    private readonly scope: ComparisonScopeService,
    private readonly ctx: CatalogueContext,
  ) {}

  /** W07: every published version with its in-scope flag and first exclusion reason (e.g. insurer_not_tied). Drafts are never shown. */
  async catalogueForTenant(principal: Principal, filters: CatalogueFilters): Promise<{ items: CatalogueRow[] }> {
    const date = this.ctx.today();
    return this.ctx.uow.run(principal.tenantId, async (tx) => {
      const base = await this.inputs.inputsFor(tx, principal, date);
      const result = await this.scope.evaluate({ ...base, line: filters.line, category: filters.category });
      const names = await this.names();
      const exclusion = new Map(result.excluded.map((e) => [e.versionId, e.reason]));
      const inScope = new Set(result.versions.map((v) => v.versionId));
      const rows = (await this.catalogue.versions())
        .filter((v) => v.status !== 'draft')
        .filter((v) => matches(v, filters, names))
        .map((v) => toRow(v, names, inScope.has(v.id), exclusion.get(v.id)));
      return { items: rows.sort(byInsurerThenProduct) };
    });
  }

  /** POST /catalogue/comparison-scopes/evaluations: the scope with display names. */
  async evaluate(principal: Principal, opts: { line?: LineOfBusiness; category?: Product['category']; date?: string }) {
    const date = opts.date ?? this.ctx.today();
    const result = await this.ctx.uow.run(principal.tenantId, (tx) => this.scope.scopeFor(tx, principal, { ...opts, date }));
    return this.withNames(result, await this.names());
  }

  /** M07 library: only in-scope versions that have a summary; stale when the wording changed or the review is over a year old. */
  async research(principal: Principal, filters: { line?: LineOfBusiness; q?: string }): Promise<{ items: ResearchItem[] }> {
    const today = this.ctx.clock.now();
    const result = await this.ctx.uow.run(principal.tenantId, (tx) => this.scope.scopeFor(tx, principal, { line: filters.line, date: this.ctx.today() }));
    const names = await this.names();
    const versions = new Map((await this.catalogue.versions()).map((v) => [v.id, v]));
    const summaries = await this.catalogue.research(result.versions.map((v) => v.versionId));
    const needle = filters.q?.trim().toLowerCase();
    const items = summaries.flatMap((r): ResearchItem[] => {
      const v = versions.get(r.versionId);
      if (!v) return [];
      const productName = names.products.get(v.productId)?.name ?? v.productId;
      const insurerName = names.insurers.get(v.insurerId)?.name ?? v.insurerId;
      if (needle && ![productName, insurerName, r.summary].some((s) => s.toLowerCase().includes(needle))) return [];
      const stale = isStale(r, v, today);
      return [{ versionId: v.id, productName, insurerName, line: v.line, posEligible: v.posEligible, summary: r.summary, points: r.points,
        sourceRef: r.sourceRef, sourceDate: r.sourceDate, stale: stale.stale, ...(stale.reason ? { staleReason: stale.reason } : {}) }];
    });
    return { items: items.sort((a, b) => a.insurerName.localeCompare(b.insurerName) || a.productName.localeCompare(b.productName)) };
  }

  /** Version detail; out-of-scope versions are indistinguishable from missing ones (404). */
  async version(principal: Principal, versionId: string) {
    const result = await this.ctx.uow.run(principal.tenantId, (tx) => this.scope.scopeFor(tx, principal, { date: this.ctx.today() }));
    if (!result.versions.some((v) => v.versionId === versionId)) throw new NotFoundError('productVersion', versionId);
    const version = await this.catalogue.getVersion(versionId);
    if (!version) throw new NotFoundError('productVersion', versionId);
    const names = await this.names();
    const v = version.props;
    return { ...toRow(v, names, true, undefined), wordingUrl: v.wordingUrl, keyFacts: v.keyFacts, quoteRequirements: v.quoteRequirements,
      effectiveFrom: v.effectiveFrom, ...(v.effectiveTo ? { effectiveTo: v.effectiveTo } : {}) };
  }

  private async names(): Promise<Names> {
    const [insurers, products] = await Promise.all([this.catalogue.insurers(), this.catalogue.products()]);
    return { insurers: new Map(insurers.map((i) => [i.id, i])), products: new Map(products.map((p) => [p.id, p])) };
  }

  private withNames(result: ScopeResult, names: Names) {
    return {
      ...result,
      versions: result.versions.map((v) => ({ ...v, productName: names.products.get(v.productId)?.name ?? v.productId, insurerName: names.insurers.get(v.insurerId)?.name ?? v.insurerId })),
      insurers: result.insurerIds.map((id) => ({ id, name: names.insurers.get(id)?.name ?? id })),
    };
  }
}

function matches(v: ProductVersionProps, f: CatalogueFilters, names: Names): boolean {
  if (f.line && v.line !== f.line) return false;
  if (f.insurerId && v.insurerId !== f.insurerId) return false;
  return !f.category || names.products.get(v.productId)?.category === f.category;
}

function toRow(v: ProductVersionProps, names: Names, inScope: boolean, exclusion: ScopeExclusion | undefined): CatalogueRow {
  const product = names.products.get(v.productId);
  return {
    versionId: v.id, productId: v.productId, productName: product?.name ?? v.productId, insurerId: v.insurerId,
    insurerName: names.insurers.get(v.insurerId)?.name ?? v.insurerId, line: v.line, category: product?.category ?? 'OTHER', uin: v.uin,
    wordingVersion: v.wordingVersion, ispEligible: true, posEligible: v.posEligible, status: v.status, inScope,
    ...(inScope || !exclusion ? {} : { exclusion }),
  };
}

function byInsurerThenProduct(a: CatalogueRow, b: CatalogueRow): number {
  return a.insurerName.localeCompare(b.insurerName) || a.productName.localeCompare(b.productName) || a.wordingVersion.localeCompare(b.wordingVersion);
}
