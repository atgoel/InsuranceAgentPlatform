import { Transaction } from '../../../kernel/persistence/unit-of-work';
import { Principal } from '../../../kernel/tenancy/principal';
import { Insurer, LineOfBusiness, Product } from '../domain/catalogue';
import { ProductVersion, ProductVersionProps, VersionStatus } from '../domain/product-version';
import { ResearchSummary } from '../domain/research';
import { ScopeInput, ScopeResult } from '../domain/scope-engine';

export type { Transaction };

/** Platform-scope catalogue (no tenant_id): insurers and products are the same for every tenant. */
export interface CatalogueRepository {
  insurers(): Promise<Insurer[]>;
  saveInsurer(i: Insurer): Promise<void>;
  products(filter?: { insurerId?: string; line?: LineOfBusiness }): Promise<Product[]>;
  saveProduct(p: Product): Promise<void>;
  versions(filter?: { productId?: string; status?: VersionStatus }): Promise<ProductVersionProps[]>;
  getVersion(id: string): Promise<ProductVersion | undefined>;
  saveVersion(v: ProductVersion): Promise<void>;
  research(versionIds: readonly string[]): Promise<ResearchSummary[]>;
  saveResearch(r: ResearchSummary): Promise<void>;
}

/** Gathers M01 (entity type, tie-ups) and M02 (selling scope) inputs for a principal. */
export interface ScopeInputsProvider {
  inputsFor(tx: Transaction, principal: Principal, date: string): Promise<Omit<ScopeInput, 'line' | 'category'>>;
}

/** Published for M06 (quotes/advice), M13 (grounding) and M14 (content). */
export interface ComparisonScopeFacade {
  scopeFor(tx: Transaction, principal: Principal, opts: { line?: LineOfBusiness; category?: Product['category']; date: string }): Promise<ScopeResult>;
  /** ForbiddenError('product_out_of_scope', { reason }) when the version is outside the principal's scope. */
  assertInScope(tx: Transaction, principal: Principal, versionId: string, date: string): Promise<void>;
}

export const CATALOGUE_REPOSITORY = Symbol('CatalogueRepository');
export const SCOPE_INPUTS_PROVIDER = Symbol('ScopeInputsProvider');
export const COMPARISON_SCOPE_FACADE = Symbol('ComparisonScopeFacade');
