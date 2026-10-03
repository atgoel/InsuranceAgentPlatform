import { BusinessRuleError, ForbiddenError, ValidationError } from '../../../kernel/errors/domain-errors';
import { SensitiveContentGuard } from '../../crm/domain/activity';

export type AdviceStatus = 'DRAFT' | 'FINALISED';

export interface CalculatorRunEntry {
  calculator: string;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  assumptionsVersion: string;
  ranAt: string;
}

/** Snapshot of the M05 ScopeResult at the time the advice started. */
export interface AdviceScope {
  disclosure: string;
  entityType: string;
  versionIdsShown: string[];
  excludedCount: number;
  evaluatedOn: string;
}

export interface AdviceRecordProps {
  id: string;
  partyId: string;
  opportunityId?: string;
  advisorMemberId: string;
  calculatorRuns: CalculatorRunEntry[];
  scope: AdviceScope;
  recommended: Array<{ versionId: string; rationale: string }>;
  customerChoice?: { versionId: string; reasonIfDifferent?: string };
  suitabilityNotes: string;
  status: AdviceStatus;
  finalisedAt?: string;
  version: number;
  createdAt: string;
}

const MAX_NOTES = 2000;
const MAX_REASON = 500;

/** F78 advice record: draft → finalised once; immutable afterwards (regulatory evidence). */
export class AdviceRecord {
  static start(input: { id: string; partyId: string; opportunityId?: string; advisorMemberId: string; scope: AdviceScope; now: Date }): AdviceRecord {
    return new AdviceRecord({
      id: input.id,
      partyId: input.partyId,
      opportunityId: input.opportunityId,
      advisorMemberId: input.advisorMemberId,
      calculatorRuns: [],
      scope: { ...input.scope, versionIdsShown: [...input.scope.versionIdsShown] },
      recommended: [],
      suitabilityNotes: '',
      status: 'DRAFT',
      version: 1,
      createdAt: input.now.toISOString(),
    });
  }

  static restore(props: AdviceRecordProps): AdviceRecord {
    return new AdviceRecord(props);
  }

  private constructor(private _props: AdviceRecordProps) {}

  get props(): Readonly<AdviceRecordProps> {
    return this._props;
  }

  markSaved(): void {
    this._props = { ...this._props, version: this._props.version + 1 };
  }

  addCalculatorRun(run: CalculatorRunEntry): void {
    this.assertDraft();
    this._props = { ...this._props, calculatorRuns: [...this._props.calculatorRuns, run] };
  }

  /** Only versions shown in the scope snapshot may be recommended (LA-6); re-recommending replaces the rationale. */
  recommend(versionId: string, rationale: string): void {
    this.assertDraft();
    this.assertShown(versionId);
    const text = rationale.trim();
    if (text.length < 10 || text.length > MAX_REASON) {
      throw new ValidationError('invalid_rationale', 'Rationale must be 10 to 500 characters', [{ path: 'rationale', code: 'length', message: '10 to 500 characters' }]);
    }
    SensitiveContentGuard.check(text);
    const others = this._props.recommended.filter((r) => r.versionId !== versionId);
    this._props = { ...this._props, recommended: [...others, { versionId, rationale: text }] };
  }

  /** A choice outside the recommendations needs the customer's reason. */
  recordChoice(versionId: string, reasonIfDifferent?: string): void {
    this.assertDraft();
    this.assertShown(versionId);
    const recommended = this._props.recommended.some((r) => r.versionId === versionId);
    const reason = reasonIfDifferent?.trim() || undefined;
    if (!recommended && !reason) {
      throw new ValidationError('choice_reason_required', 'A reason is required when the customer chooses a product that was not recommended', [
        { path: 'reasonIfDifferent', code: 'required', message: 'Required when the choice was not recommended' },
      ]);
    }
    if (reason && reason.length > MAX_REASON) {
      throw new ValidationError('invalid_reason', 'Reason must be at most 500 characters', [{ path: 'reasonIfDifferent', code: 'length', message: 'At most 500 characters' }]);
    }
    if (reason) SensitiveContentGuard.check(reason);
    this._props = { ...this._props, customerChoice: recommended ? { versionId } : { versionId, reasonIfDifferent: reason } };
  }

  setNotes(text: string): void {
    this.assertDraft();
    if (text.length > MAX_NOTES) {
      throw new ValidationError('notes_too_long', 'Suitability notes must be at most 2000 characters', [{ path: 'text', code: 'length', message: 'At most 2000 characters' }]);
    }
    SensitiveContentGuard.check(text);
    this._props = { ...this._props, suitabilityNotes: text };
  }

  finalise(now: Date): void {
    this.assertDraft();
    const missing: string[] = [];
    if (this._props.recommended.length === 0) missing.push('recommendation');
    if (!this._props.customerChoice) missing.push('customerChoice');
    if (missing.length) throw new BusinessRuleError('advice_incomplete', 'The advice record is incomplete', { missing });
    this._props = { ...this._props, status: 'FINALISED', finalisedAt: now.toISOString() };
  }

  /** True when the customer chose one of the recommended versions. */
  get choseRecommended(): boolean {
    const choice = this._props.customerChoice;
    return !!choice && this._props.recommended.some((r) => r.versionId === choice.versionId);
  }

  private assertShown(versionId: string): void {
    if (!this._props.scope.versionIdsShown.includes(versionId)) {
      throw new ForbiddenError('product_out_of_scope', 'This product was not in the comparison scope shown to the customer', { reason: 'not_shown' });
    }
  }

  private assertDraft(): void {
    if (this._props.status === 'FINALISED') throw new BusinessRuleError('advice_finalised', 'A finalised advice record cannot change');
  }
}
