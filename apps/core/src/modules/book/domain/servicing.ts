import { BusinessRuleError, ValidationError } from '../../../kernel/errors/domain-errors';
import { SensitiveContentGuard } from '../../../kernel/domain/sensitive-content';
import { assertDate } from './premium-schedule';

export const SERVICING_KINDS = ['ADDRESS_CHANGE', 'NOMINEE_CHANGE', 'BANK_MANDATE', 'SURRENDER', 'LOAN', 'CLAIM', 'DUPLICATE_POLICY', 'OTHER'] as const;
export type ServicingKind = typeof SERVICING_KINDS[number];
export const SERVICING_STATUSES = ['OPEN', 'SUBMITTED_TO_INSURER', 'AWAITING_CUSTOMER', 'RESOLVED', 'REJECTED'] as const;
export type ServicingStatus = typeof SERVICING_STATUSES[number];
export interface ServicingRequestProps {
  id: string; heldPolicyId: string; kind: ServicingKind; insurerRef?: string; status: ServicingStatus;
  followUpOn?: string; portalUrl?: string; notes: Array<{ at: string; by: string; text: string }>; version: number;
}
export class ServicingRequest {
  private constructor(private value: ServicingRequestProps) {}
  static create(input: Omit<ServicingRequestProps, 'status' | 'notes' | 'version'> & { now: Date }): ServicingRequest {
    const { now: _now, ...props } = input;
    void _now;
    const request = new ServicingRequest({ ...props, status: 'OPEN', notes: [], version: 1 });
    request.update(props);
    return request;
  }
  static restore(props: ServicingRequestProps): ServicingRequest { return new ServicingRequest(structuredClone(props)); }
  get props(): Readonly<ServicingRequestProps> { return structuredClone(this.value); }
  markSaved(): void { this.value.version++; }
  transition(status: ServicingStatus): void {
    if (status === this.value.status) return;
    const allowed: Record<ServicingStatus, readonly ServicingStatus[]> = {
      OPEN: ['SUBMITTED_TO_INSURER'], SUBMITTED_TO_INSURER: ['AWAITING_CUSTOMER', 'RESOLVED', 'REJECTED'],
      AWAITING_CUSTOMER: ['SUBMITTED_TO_INSURER', 'RESOLVED', 'REJECTED'], RESOLVED: [], REJECTED: [],
    };
    if (!allowed[this.value.status].includes(status)) throw new BusinessRuleError('invalid_servicing_transition', 'Illegal servicing status transition');
    this.value.status = status;
  }
  addNote(text: string, by: string, now: Date): void {
    if (text.trim().length === 0 || text.length > 1000) throw new ValidationError('invalid_note', 'Note must contain 1 to 1000 characters');
    SensitiveContentGuard.check(text);
    this.value.notes.push({ at: now.toISOString(), by, text });
  }
  setFollowUp(on?: string): void { if (on !== undefined) assertDate(on); this.value.followUpOn = on; }
  update(patch: { insurerRef?: string; followUpOn?: string; portalUrl?: string }): void {
    if (patch.portalUrl !== undefined) {
      try { if (new URL(patch.portalUrl).protocol !== 'https:') throw new Error(); }
      catch { throw new ValidationError('invalid_portal_url', 'Insurer portal link must use HTTPS'); }
      this.value.portalUrl = patch.portalUrl;
    }
    if (patch.insurerRef !== undefined) {
      if (patch.insurerRef.length > 120) throw new ValidationError('invalid_insurer_ref', 'Insurer reference is too long');
      this.value.insurerRef = patch.insurerRef;
    }
    if (patch.followUpOn !== undefined) this.setFollowUp(patch.followUpOn);
  }
}
