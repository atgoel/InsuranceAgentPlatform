import { Inject, Injectable } from '@nestjs/common';
import { AdviceRecord, AdviceScope as AdviceScopeSnapshot, CalculatorRunEntry } from '../domain/advice-record';
import { CATALOGUE_QUERY, CatalogueQueryFacade, VersionDetail } from './ports';

export interface AdviceView {
  id: string;
  partyId: string;
  opportunityId?: string;
  advisorMemberId: string;
  status: 'DRAFT' | 'FINALISED';
  finalisedAt?: string;
  version: number;
  createdAt: string;
  scope: AdviceScopeSnapshot;
  calculatorRuns: CalculatorRunEntry[];
  suitabilityNotes: string;
  shownProducts: Array<{ versionId: string; productName: string; insurerName: string; line: string; category: string }>;
  recommended: Array<{ versionId: string; rationale: string; productName: string; insurerName: string }>;
  customerChoice?: { versionId: string; reasonIfDifferent?: string; productName: string; insurerName: string };
  missing: Array<'recommendation' | 'customerChoice'>;
}

/** Adds M05 product and insurer names to an advice record. */
@Injectable()
export class AdviceViews {
  constructor(@Inject(CATALOGUE_QUERY) private readonly catalogue: CatalogueQueryFacade) {}

  async build(record: AdviceRecord): Promise<AdviceView> {
    const p = record.props;
    const ids = [...new Set([...p.scope.versionIdsShown, ...p.recommended.map((r) => r.versionId), ...(p.customerChoice ? [p.customerChoice.versionId] : [])])];
    const details = new Map((await this.catalogue.versionDetails(ids)).map((d) => [d.versionId, d]));
    const named = (versionId: string): Pick<VersionDetail, 'productName' | 'insurerName'> => ({
      productName: details.get(versionId)?.productName ?? versionId,
      insurerName: details.get(versionId)?.insurerName ?? '',
    });
    const missing: AdviceView['missing'] = [];
    if (p.status === 'DRAFT') {
      if (p.recommended.length === 0) missing.push('recommendation');
      if (!p.customerChoice) missing.push('customerChoice');
    }
    return {
      id: p.id, partyId: p.partyId, opportunityId: p.opportunityId, advisorMemberId: p.advisorMemberId, status: p.status, finalisedAt: p.finalisedAt, version: p.version,
      createdAt: p.createdAt, scope: p.scope, calculatorRuns: p.calculatorRuns, suitabilityNotes: p.suitabilityNotes,
      shownProducts: p.scope.versionIdsShown.flatMap((versionId) => {
        const d = details.get(versionId);
        return d ? [{ versionId, productName: d.productName, insurerName: d.insurerName, line: d.line, category: d.category }] : [];
      }),
      recommended: p.recommended.map((r) => ({ versionId: r.versionId, rationale: r.rationale, ...named(r.versionId) })),
      customerChoice: p.customerChoice ? { ...p.customerChoice, ...named(p.customerChoice.versionId) } : undefined,
      missing,
    };
  }
}
