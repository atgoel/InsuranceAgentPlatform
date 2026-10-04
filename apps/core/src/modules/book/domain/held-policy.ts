import { BusinessRuleError, ValidationError } from '../../../kernel/errors/domain-errors';
import { PolicyCommercials, PolicyCommercialsProps, PolicyLine } from '../../../kernel/insurance/policy-commercials';
import { CustomFieldValues } from '../../../kernel/custom-fields';
import { createRiskSchemaRegistry, checkRiskAgainstCommercials, riskSchemaFor } from '../../../kernel/insurance/risk-details';
import { addMonthsClamped, annualGraceDays, assertDate, LIFE_GRACE, MODE_MONTHS, PremiumMode } from './premium-schedule';
import { addDays, istDate } from '../../../kernel/domain/ist';

export const POLICY_STATUSES = [
  'IN_FORCE',
  'GRACE',
  'LAPSED',
  'PAID_UP',
  'MATURED',
  'SURRENDERED',
  'CLAIMED',
  'EXPIRED',
  'CANCELLED',
] as const;
export type PolicyStatus = (typeof POLICY_STATUSES)[number];
export const POLICY_SOURCES = ['IMPORT', 'AI_EXTRACTED', 'MANUAL', 'PLATFORM_SALE'] as const;
export type PolicySource = (typeof POLICY_SOURCES)[number];
export interface HeldPolicyProps {
  id: string;
  line: PolicyLine;
  insurerId?: string;
  insurerName: string;
  productVersionId?: string;
  productName: string;
  policyNumberEnc: string;
  policyNumberHash: string;
  policyNumberLast4: string;
  sumAssuredPaise?: number;
  premiumPaise: number;
  mode: PremiumMode;
  commencementDate: string;
  nextDueDate?: string;
  maturityDate?: string;
  premiumPayingTermYears?: number;
  policyTermYears?: number;
  renewalDate?: string;
  status: PolicyStatus;
  statusAsOf: string;
  source: PolicySource;
  sourceRef?: string;
  asOf: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  servicingMemberId?: string;
  orgUnitId?: string;
  distanceSale?: boolean;
  proposerPartyId: string;
  saleRef?: { policySaleId: string; opportunityId?: string };
  commercials: PolicyCommercialsProps;
  bookingChannel?: { code: string; insurerCodeId?: string };
  risk?: { schemaId: string; schemaVersion: number; details: unknown };
  registrationNoEnc?: string;
  registrationNoHash?: string;
  registrationNoLast4?: string;
  customFields: CustomFieldValues;
  createdAt: string;
  updatedAt: string;
  version: number;
}
export type RegisterHeldPolicyInput = Omit<HeldPolicyProps, 'createdAt' | 'updatedAt' | 'version'> & { now: Date };
export const TERMINAL_STATUSES: readonly PolicyStatus[] = ['MATURED', 'SURRENDERED', 'CLAIMED', 'EXPIRED', 'CANCELLED'];

function checkDates(input: RegisterHeldPolicyInput): void {
  for (const date of [input.asOf, input.statusAsOf, input.nextDueDate, input.maturityDate, input.renewalDate])
    if (date !== undefined) assertDate(date);
  if (input.maturityDate !== undefined && input.maturityDate < input.commercials.commencementDate)
    throw new ValidationError('invalid_policy_dates', 'Maturity cannot precede commencement');
  if (input.nextDueDate !== undefined && input.nextDueDate < input.commercials.commencementDate)
    throw new ValidationError('invalid_policy_dates', 'Due cannot precede commencement');
}

function checkRisk(
  input: Pick<HeldPolicyProps, 'risk' | 'registrationNoEnc' | 'registrationNoHash' | 'registrationNoLast4'>,
  commercials: PolicyCommercials,
  today: string,
): void {
  if (!input.risk) return;
  const schema = riskSchemaFor(commercials.props.category);
  if (!schema || schema.id !== input.risk.schemaId || schema.version !== input.risk.schemaVersion)
    throw new ValidationError('risk_schema_mismatch', 'Risk schema does not match category');
  const details = input.risk.details;
  // The service validates the original motor number, then removes it before storage.
  if (schema.id === 'motor' && input.registrationNoEnc && input.registrationNoHash && input.registrationNoLast4) {
    checkRiskAgainstCommercials(schema.id, details, commercials, today);
    return;
  }
  const parsed = createRiskSchemaRegistry().parse(schema.id, schema.version, details);
  checkRiskAgainstCommercials(schema.id, parsed, commercials, today);
}

export class HeldPolicy {
  private constructor(private value: HeldPolicyProps) {}
  static register(input: RegisterHeldPolicyInput): HeldPolicy {
    const commercials = PolicyCommercials.create(input.commercials);
    if (input.line !== commercials.props.line) throw new ValidationError('category_line_mismatch', 'Line must match commercials');
    if (input.line !== 'LIFE' && !['ANNUAL', 'SINGLE'].includes(input.mode))
      throw new ValidationError('invalid_premium_mode', 'Annual contracts require ANNUAL or SINGLE mode');
    if (input.sumAssuredPaise !== undefined && (!Number.isSafeInteger(input.sumAssuredPaise) || input.sumAssuredPaise < 0))
      throw new ValidationError('invalid_sum_assured', 'Sum assured must be non-negative integer paise');
    checkDates(input);
    checkRisk(input, commercials, istDate(input.now));
    const { now, ...props } = input;
    return new HeldPolicy({
      ...props,
      commercials: { ...commercials.props },
      commencementDate: commercials.props.commencementDate,
      premiumPaise: commercials.props.premiumGrossPaise,
      renewalDate: commercials.renewalDate() ?? input.renewalDate,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      version: 1,
    });
  }
  static restore(props: HeldPolicyProps): HeldPolicy {
    return new HeldPolicy(structuredClone(props));
  }
  get props(): Readonly<HeldPolicyProps> {
    return structuredClone(this.value);
  }
  markSaved(): void {
    this.value.version++;
  }

  recordPayment(installmentDue: string, paidOn: string, now: Date): void {
    const due = this.requirePayment(installmentDue, paidOn, now);
    const anchor = this.value.line === 'LIFE' ? this.value.commencementDate : due;
    const next = addMonthsClamped(due, MODE_MONTHS[this.value.mode], Number(anchor.slice(8, 10)));
    if (this.value.line === 'LIFE') this.value.nextDueDate = next;
    else {
      this.value.renewalDate = next;
      this.value.commercials = { ...this.value.commercials, expiryDate: addDays(next, -1) };
    }
    this.value.status = this.statusAfterPayment(next, istDate(now));
    this.value.statusAsOf = paidOn;
    this.value.updatedAt = now.toISOString();
  }
  private requirePayment(installmentDue: string, paidOn: string, now: Date): string {
    assertDate(installmentDue);
    assertDate(paidOn);
    if (TERMINAL_STATUSES.includes(this.value.status) || this.value.status === 'PAID_UP')
      throw new BusinessRuleError('policy_closed', 'This policy cannot accept payments');
    if (paidOn > istDate(now)) throw new ValidationError('payment_in_future', 'Payment cannot be in the future');
    const due = this.value.line === 'LIFE' ? this.value.nextDueDate : this.value.renewalDate;
    if (due !== installmentDue || this.value.mode === 'SINGLE')
      throw new BusinessRuleError('installment_not_due', 'Installment is not the next unpaid due');
    this.requireWithinWindow(due, paidOn);
    return due;
  }
  private requireWithinWindow(due: string, paidOn: string): void {
    if (this.value.line === 'LIFE') {
      if (paidOn > addMonthsClamped(due, LIFE_GRACE.revivalYears * 12))
        throw new BusinessRuleError('revival_window_expired', 'Revival window has expired');
    } else if (paidOn > addDays(due, annualGraceDays(this.value.line))) {
      throw new BusinessRuleError('renewal_window_expired', 'The renewal grace period has ended');
    }
  }
  /** Revival needs every arrear paid: a still-overdue next installment keeps the policy in GRACE or LAPSED. */
  private statusAfterPayment(next: string, today: string): PolicyStatus {
    if (this.value.line !== 'LIFE' || next >= today) return 'IN_FORCE';
    return today <= addDays(next, LIFE_GRACE.graceDays(this.value.mode)) ? 'GRACE' : 'LAPSED';
  }
  updateStatusFromSource(status: PolicyStatus, asOf: string, source: PolicySource): void {
    assertDate(asOf);
    if (asOf <= this.value.statusAsOf) return;
    const allowed: Partial<Record<PolicyStatus, readonly PolicyStatus[]>> = {
      IN_FORCE: ['GRACE', ...TERMINAL_STATUSES],
      GRACE: ['IN_FORCE', 'LAPSED', 'SURRENDERED', 'CLAIMED'],
      LAPSED: ['IN_FORCE', 'PAID_UP'],
      PAID_UP: ['MATURED', 'SURRENDERED', 'CLAIMED'],
    };
    if (!TERMINAL_STATUSES.includes(this.value.status) && status !== this.value.status && !allowed[this.value.status]?.includes(status))
      throw new BusinessRuleError('invalid_policy_transition', 'Illegal policy status transition');
    this.value.status = status;
    this.value.statusAsOf = asOf;
    this.value.asOf = asOf;
    this.value.source = source;
  }
  renew(newRenewalDate: string, premiumPaise: number, now: Date): void {
    assertDate(newRenewalDate);
    if (this.value.line === 'LIFE')
      throw new BusinessRuleError('renewal_not_applicable', 'Renewal requires an annual health or general contract');
    if (TERMINAL_STATUSES.includes(this.value.status) || this.value.status === 'PAID_UP')
      throw new BusinessRuleError('policy_closed', 'Closed policies require a newer source status before renewal');
    if (this.value.renewalDate !== undefined && newRenewalDate <= this.value.renewalDate)
      throw new BusinessRuleError('invalid_renewal_date', 'Renewal must advance the date');
    if (!Number.isSafeInteger(premiumPaise) || premiumPaise < 0)
      throw new ValidationError('invalid_premium', 'Premium must be non-negative integer paise');
    // A caller changing gross must supply full commercials through replaceCommercials; preserve the tax amount here.
    if (premiumPaise < this.value.commercials.premiumTaxPaise)
      throw new ValidationError('premium_mismatch', 'Gross premium cannot be less than tax');
    this.value.commercials = {
      ...this.value.commercials,
      premiumGrossPaise: premiumPaise,
      premiumNetPaise: premiumPaise - this.value.commercials.premiumTaxPaise,
      expiryDate: addDays(newRenewalDate, -1),
    };
    this.value.premiumPaise = premiumPaise;
    this.value.renewalDate = newRenewalDate;
    this.value.status = 'IN_FORCE';
    this.value.statusAsOf = istDate(now);
    this.value.updatedAt = now.toISOString();
  }
  assignServicing(memberId: string, orgUnitId: string): void {
    this.value.servicingMemberId = memberId;
    this.value.orgUnitId = orgUnitId;
  }
  replaceBookingChannel(channel: HeldPolicyProps['bookingChannel']): void {
    this.value.bookingChannel = channel ? { ...channel } : undefined;
  }
  replaceCommercials(input: PolicyCommercialsProps, risk = this.value.risk, now?: Date): void {
    const commercials = PolicyCommercials.create(input);
    if (commercials.props.line !== this.value.line) throw new ValidationError('category_line_mismatch', 'Policy line cannot change');
    checkRisk({ ...this.value, risk }, commercials, now ? istDate(now) : this.value.asOf);
    this.value.commercials = { ...commercials.props };
    this.value.premiumPaise = input.premiumGrossPaise;
    this.value.commencementDate = input.commencementDate;
    this.value.renewalDate = commercials.renewalDate() ?? this.value.renewalDate;
    this.value.risk = risk;
  }
  replaceCustomFields(values: CustomFieldValues): void {
    this.value.customFields = { ...values };
  }
  replaceRisk(
    risk: HeldPolicyProps['risk'],
    encrypted: Pick<HeldPolicyProps, 'registrationNoEnc' | 'registrationNoHash' | 'registrationNoLast4'> = {},
  ): void {
    this.value.risk = risk;
    this.value.registrationNoEnc = encrypted.registrationNoEnc;
    this.value.registrationNoHash = encrypted.registrationNoHash;
    this.value.registrationNoLast4 = encrypted.registrationNoLast4;
  }
  relinkProposer(from: string, to: string): void {
    if (this.value.proposerPartyId === from) this.value.proposerPartyId = to;
  }
}
