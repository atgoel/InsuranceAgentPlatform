import { Inject, Injectable } from '@nestjs/common';
import { ForbiddenError } from '../../../kernel/errors/domain-errors';
import { Principal } from '../../../kernel/tenancy/principal';
import { LineOfBusiness, Product } from '../domain/catalogue';
import { ComparisonScopeEngine, ScopeInput, ScopeResult } from '../domain/scope-engine';
import { CATALOGUE_REPOSITORY, CatalogueRepository, ComparisonScopeFacade, SCOPE_INPUTS_PROVIDER, ScopeInputsProvider, Transaction } from './ports';
import { CatalogueContext } from './catalogue-context';

/** Facade over the scope engine (LA-6): inputs from verified context, catalogue from the platform repository. */
@Injectable()
export class ComparisonScopeService implements ComparisonScopeFacade {
  private readonly engine = new ComparisonScopeEngine();

  constructor(
    @Inject(CATALOGUE_REPOSITORY) private readonly catalogue: CatalogueRepository,
    @Inject(SCOPE_INPUTS_PROVIDER) private readonly inputs: ScopeInputsProvider,
    private readonly ctx: CatalogueContext,
  ) {}

  async scopeFor(tx: Transaction, principal: Principal, opts: { line?: LineOfBusiness; category?: Product['category']; date: string }): Promise<ScopeResult> {
    const input: ScopeInput = { ...(await this.inputs.inputsFor(tx, principal, opts.date)), line: opts.line, category: opts.category };
    return this.evaluate(input);
  }

  async assertInScope(tx: Transaction, principal: Principal, versionId: string, date: string): Promise<void> {
    const result = await this.scopeFor(tx, principal, { date });
    if (result.versions.some((v) => v.versionId === versionId)) return;
    const reason = result.excluded.find((e) => e.versionId === versionId)?.reason ?? 'unknown_version';
    throw new ForbiddenError('product_out_of_scope', 'This product is outside your comparison scope', { reason });
  }

  /** Runs the engine over the whole platform catalogue; also used by the query service for the W07 table. */
  async evaluate(input: ScopeInput): Promise<ScopeResult> {
    const [versions, insurers, products] = await Promise.all([this.catalogue.versions(), this.catalogue.insurers(), this.catalogue.products()]);
    const result = this.engine.evaluate(input, { versions, insurers, products });
    this.ctx.metrics.counter('catalogue_scope_evaluations_total', 'Comparison scope evaluations', ['entity_type']).inc({ entity_type: input.entityType });
    this.ctx.logger.debug('catalogue.scope.evaluated', 'Comparison scope evaluated', { entityType: input.entityType, included: result.versions.length, excluded: countBy(result.excluded.map((e) => e.reason)) });
    return result;
  }
}

function countBy(values: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of values) out[v] = (out[v] ?? 0) + 1;
  return out;
}
