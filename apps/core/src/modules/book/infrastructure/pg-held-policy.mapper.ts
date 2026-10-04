import { HeldPolicy, HeldPolicyProps } from '../domain/held-policy';
import { PolicyCommercialsProps } from '../../../kernel/insurance/policy-commercials';
import { CustomFieldValues } from '../../../kernel/custom-fields';

type Nullable<T> = T | null;
export interface PolicyRow {
  id: string;
  proposer_party_id: string;
  line: HeldPolicyProps['line'];
  insurer_id: Nullable<string>;
  insurer_name: string;
  product_version_id: Nullable<string>;
  product_name: string;
  policy_number_enc: string;
  policy_number_hash: string;
  policy_number_last4: string;
  mode: HeldPolicyProps['mode'];
  status: HeldPolicyProps['status'];
  status_as_of: Date | string;
  source: HeldPolicyProps['source'];
  source_ref: Nullable<string>;
  as_of: Date | string;
  confidence: HeldPolicyProps['confidence'];
  next_due_date: Nullable<Date | string>;
  renewal_date: Nullable<Date | string>;
  commencement_date: Date | string;
  maturity_date: Nullable<Date | string>;
  sum_assured_paise: Nullable<string>;
  premium_paying_term_years: Nullable<number>;
  policy_term_years: Nullable<number>;
  servicing_member_id: Nullable<string>;
  org_unit_id: Nullable<string>;
  sale_id: Nullable<string>;
  opportunity_id: Nullable<string>;
  booked_on: Date | string;
  expiry_date: Nullable<Date | string>;
  product_category: PolicyCommercialsProps['category'];
  business_type: PolicyCommercialsProps['businessType'];
  previous_insurer_name: Nullable<string>;
  policy_term_months: Nullable<number>;
  premium_net_paise: string;
  premium_tax_paise: string;
  premium_gross_paise: string;
  booking_channel_code: Nullable<string>;
  booking_insurer_code_id: Nullable<string>;
  business_source: Nullable<PolicyCommercialsProps['businessSource']>;
  referred_by_name: Nullable<string>;
  referred_by_party_id: Nullable<string>;
  referred_by_member_id: Nullable<string>;
  remarks: Nullable<string>;
  risk_details: Nullable<unknown>;
  risk_schema_id: Nullable<string>;
  risk_schema_version: Nullable<number>;
  registration_no_enc: Nullable<string>;
  registration_no_hash: Nullable<string>;
  registration_no_last4: Nullable<string>;
  custom_fields: CustomFieldValues;
  distance_sale: boolean;
  created_at: Date | string;
  updated_at: Date | string;
  version: number;
}
const optional = <T>(value: Nullable<T>): T | undefined => value ?? undefined;
const calendar = (value: Nullable<string | Date>): string | undefined =>
  value == null ? undefined : value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
function money(value: string): number {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount < 0) throw new Error('Stored amount is outside the safe money range');
  return amount;
}
function commercials(row: PolicyRow): PolicyCommercialsProps {
  return {
    category: row.product_category,
    line: row.line,
    businessType: row.business_type,
    previousInsurerName: optional(row.previous_insurer_name),
    bookedOn: calendar(row.booked_on) as string,
    commencementDate: calendar(row.commencement_date) as string,
    expiryDate: calendar(row.expiry_date),
    policyTermMonths: optional(row.policy_term_months),
    premiumNetPaise: money(row.premium_net_paise),
    premiumTaxPaise: money(row.premium_tax_paise),
    premiumGrossPaise: money(row.premium_gross_paise),
    bookingChannelCode: optional(row.booking_channel_code),
    businessSource: optional(row.business_source),
    remarks: optional(row.remarks),
    referredBy: row.referred_by_name
      ? { name: row.referred_by_name, partyId: optional(row.referred_by_party_id), memberId: optional(row.referred_by_member_id) }
      : undefined,
  };
}
function risk(row: PolicyRow): HeldPolicyProps['risk'] {
  if (row.risk_schema_id === null || row.risk_schema_version === null) return undefined;
  return { schemaId: row.risk_schema_id, schemaVersion: row.risk_schema_version, details: row.risk_details };
}
export function restorePolicy(row: PolicyRow): HeldPolicy {
  return HeldPolicy.restore({
    id: row.id,
    line: row.line,
    insurerId: optional(row.insurer_id),
    insurerName: row.insurer_name,
    productVersionId: optional(row.product_version_id),
    productName: row.product_name,
    policyNumberEnc: row.policy_number_enc,
    policyNumberHash: row.policy_number_hash,
    policyNumberLast4: row.policy_number_last4,
    sumAssuredPaise: row.sum_assured_paise === null ? undefined : money(row.sum_assured_paise),
    premiumPaise: money(row.premium_gross_paise),
    mode: row.mode,
    commencementDate: calendar(row.commencement_date) as string,
    nextDueDate: calendar(row.next_due_date),
    maturityDate: calendar(row.maturity_date),
    renewalDate: calendar(row.renewal_date),
    premiumPayingTermYears: optional(row.premium_paying_term_years),
    policyTermYears: optional(row.policy_term_years),
    status: row.status,
    statusAsOf: calendar(row.status_as_of) as string,
    source: row.source,
    sourceRef: optional(row.source_ref),
    asOf: calendar(row.as_of) as string,
    confidence: row.confidence,
    servicingMemberId: optional(row.servicing_member_id),
    orgUnitId: optional(row.org_unit_id),
    proposerPartyId: row.proposer_party_id,
    saleRef: row.sale_id ? { policySaleId: row.sale_id, opportunityId: optional(row.opportunity_id) } : undefined,
    commercials: commercials(row),
    bookingChannel: row.booking_channel_code
      ? { code: row.booking_channel_code, insurerCodeId: optional(row.booking_insurer_code_id) }
      : undefined,
    risk: risk(row),
    registrationNoEnc: optional(row.registration_no_enc),
    registrationNoHash: optional(row.registration_no_hash),
    registrationNoLast4: optional(row.registration_no_last4),
    customFields: row.custom_fields,
    distanceSale: row.distance_sale || undefined,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    version: row.version,
  });
}
export function policyColumns(p: Readonly<HeldPolicyProps>, tenantId: string): Record<string, unknown> {
  return {
    id: p.id,
    tenant_id: tenantId,
    proposer_party_id: p.proposerPartyId,
    line: p.line,
    insurer_id: p.insurerId,
    insurer_name: p.insurerName,
    product_version_id: p.productVersionId,
    product_name: p.productName,
    policy_number_enc: p.policyNumberEnc,
    policy_number_hash: p.policyNumberHash,
    policy_number_last4: p.policyNumberLast4,
    mode: p.mode,
    sum_assured_paise: p.sumAssuredPaise,
    commencement_date: p.commencementDate,
    maturity_date: p.maturityDate,
    premium_paying_term_years: p.premiumPayingTermYears,
    policy_term_years: p.policyTermYears,
    status: p.status,
    status_as_of: p.statusAsOf,
    source: p.source,
    source_ref: p.sourceRef,
    as_of: p.asOf,
    confidence: p.confidence,
    next_due_date: p.nextDueDate,
    renewal_date: p.renewalDate,
    servicing_member_id: p.servicingMemberId,
    org_unit_id: p.orgUnitId,
    sale_id: p.saleRef?.policySaleId,
    opportunity_id: p.saleRef?.opportunityId,
    ...commercialColumns(p),
    custom_fields: JSON.stringify(p.customFields),
    distance_sale: p.distanceSale ?? false,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
    version: p.version + 1,
  };
}
function commercialColumns(p: Readonly<HeldPolicyProps>): Record<string, unknown> {
  const c = p.commercials;
  return {
    booked_on: c.bookedOn,
    expiry_date: c.expiryDate,
    product_category: c.category,
    business_type: c.businessType,
    previous_insurer_name: c.previousInsurerName,
    policy_term_months: c.policyTermMonths,
    premium_net_paise: c.premiumNetPaise,
    premium_tax_paise: c.premiumTaxPaise,
    premium_gross_paise: c.premiumGrossPaise,
    booking_channel_code: p.bookingChannel?.code ?? c.bookingChannelCode,
    booking_insurer_code_id: p.bookingChannel?.insurerCodeId,
    business_source: c.businessSource,
    referred_by_name: c.referredBy?.name,
    referred_by_party_id: c.referredBy?.partyId,
    referred_by_member_id: c.referredBy?.memberId,
    remarks: c.remarks,
    risk_details: p.risk ? JSON.stringify(p.risk.details) : undefined,
    risk_schema_id: p.risk?.schemaId,
    risk_schema_version: p.risk?.schemaVersion,
    registration_no_enc: p.registrationNoEnc,
    registration_no_hash: p.registrationNoHash,
    registration_no_last4: p.registrationNoLast4,
  };
}
