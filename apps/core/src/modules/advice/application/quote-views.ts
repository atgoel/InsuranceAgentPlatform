import { Inject, Injectable } from '@nestjs/common';
import { istDate } from '../../../kernel/domain/ist';
import { BusinessRuleError } from '../../../kernel/errors/domain-errors';
import { Principal } from '../../../kernel/tenancy/principal';
import { BiRecordProps } from '../domain/benefit-illustration';
import { ComparisonRow, QuoteOptionProps, QuoteRequest, QuoteRequestProps } from '../domain/quote';
import { ADVICE_REPOSITORY, AdviceRepository, BI_REPOSITORY, BiRepository, CATALOGUE_QUERY, COMPARISON_SCOPE_FACADE, CatalogueQueryFacade, ComparisonScopeFacade, Transaction, VersionDetail } from './ports';
import { AdviceContext } from './advice-context';

export type QuoteOptionView = QuoteOptionProps & {
  productName: string;
  insurerName: string;
  category: string;
  /** validUntil is before today (IST). */
  expired: boolean;
  bi: { required: boolean; acknowledged: boolean; records: BiRecordProps[] };
};

export interface QuoteView extends Omit<QuoteRequestProps, 'options'> {
  disclosure: string;
  options: QuoteOptionView[];
  comparison: ComparisonRow[];
}

/** IRDAI BI rule (M06 §3.4): LIFE savings, ULIP and pension products need an acknowledged illustration; term and health do not. */
export function biRequired(detail: Pick<VersionDetail, 'line' | 'category'> | undefined): boolean {
  return !!detail && detail.line === 'LIFE' && detail.category !== 'TERM';
}

/** Quote views: product names (M05), benefit-illustration state and the scope disclosure. */
@Injectable()
export class QuoteViews {
  constructor(
    @Inject(CATALOGUE_QUERY) private readonly catalogue: CatalogueQueryFacade,
    @Inject(BI_REPOSITORY) private readonly illustrations: BiRepository,
    @Inject(ADVICE_REPOSITORY) private readonly advice: AdviceRepository,
    @Inject(COMPARISON_SCOPE_FACADE) private readonly scopes: ComparisonScopeFacade,
    private readonly ctx: AdviceContext,
  ) {}

  async details(versionIds: readonly string[]): Promise<Map<string, VersionDetail>> {
    return new Map((await this.catalogue.versionDetails([...new Set(versionIds)])).map((d) => [d.versionId, d]));
  }

  /** The linked advice record's scope snapshot, else a fresh evaluation for the quote's line. */
  async disclosure(tx: Transaction, principal: Principal, quote: QuoteRequest): Promise<string> {
    const p = quote.props;
    const linked = p.adviceRecordId ? await this.advice.get(tx, p.adviceRecordId) : undefined;
    if (linked) return linked.props.scope.disclosure;
    return (await this.scopes.scopeFor(tx, principal, { line: p.line, date: istDate(this.ctx.clock.now()) })).disclosure;
  }

  async build(tx: Transaction, principal: Principal, quote: QuoteRequest): Promise<QuoteView> {
    const { options, ...rest } = quote.props;
    const today = istDate(this.ctx.clock.now());
    const details = await this.details(options.map((o) => o.versionId));
    const optionViews: QuoteOptionView[] = [];
    for (const o of options) {
      const detail = details.get(o.versionId);
      const records = (await this.illustrations.forOption(tx, o.id)).map((b) => structuredClone(b.props));
      optionViews.push({
        ...o,
        productName: detail?.productName ?? o.versionId,
        insurerName: detail?.insurerName ?? o.insurerId,
        category: detail?.category ?? 'OTHER',
        expired: o.validUntil < today,
        bi: { required: biRequired(detail), acknowledged: records.some((r) => !!r.acknowledgement), records },
      });
    }
    return { ...structuredClone(rest), disclosure: await this.disclosure(tx, principal, quote), options: optionViews, comparison: quote.comparison() };
  }

  /** IRDAI BI rule: a LIFE savings/ULIP/pension option can only be selected once one of its benefit illustrations is acknowledged. */
  async assertBiAcknowledged(tx: Transaction, option: QuoteOptionProps): Promise<void> {
    const detail = (await this.details([option.versionId])).get(option.versionId);
    if (!biRequired(detail)) return;
    const records = await this.illustrations.forOption(tx, option.id);
    if (!records.some((r) => r.acknowledged)) {
      throw new BusinessRuleError('bi_acknowledgement_required', 'An acknowledged benefit illustration is required before this product can be selected', { optionId: option.id });
    }
  }
}
