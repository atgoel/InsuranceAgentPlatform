import { z } from 'zod';
import { POLICY_CATEGORIES, BUSINESS_TYPES, BUSINESS_SOURCES } from '../../../kernel/insurance/policy-commercials';
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, 'Invalid calendar date');
export const FollowUpDateSchema = date.optional();
const text = z.string().min(1).max(200);
const money = z.number().int().safe().nonnegative();
export const StatusSchema = z.enum(['IN_FORCE', 'GRACE', 'LAPSED', 'PAID_UP', 'MATURED', 'SURRENDERED', 'CLAIMED', 'EXPIRED', 'CANCELLED']);
export const CommercialsSchema = z
  .object({
    category: z.enum(POLICY_CATEGORIES),
    line: z.enum(['LIFE', 'HEALTH', 'GENERAL']),
    businessType: z.enum(BUSINESS_TYPES),
    previousInsurerName: text.optional(),
    bookedOn: date,
    commencementDate: date,
    expiryDate: date.optional(),
    policyTermMonths: z.number().int().min(1).max(1200).optional(),
    premiumNetPaise: money,
    premiumTaxPaise: money,
    premiumGrossPaise: money,
    bookingChannelCode: z.string().max(60).optional(),
    businessSource: z.enum(BUSINESS_SOURCES).optional(),
    referredBy: z
      .object({ name: z.string().min(1).max(120), memberId: text.optional(), partyId: text.optional() })
      .strict()
      .optional(),
    remarks: z.string().max(1000).optional(),
  })
  .strict();
const risk = z.object({ schemaId: text, schemaVersion: z.number().int().positive(), details: z.unknown() }).strict();
export const RegisterPolicySchema = z
  .object({
    line: z.enum(['LIFE', 'HEALTH', 'GENERAL']),
    insurerId: text.optional(),
    insurerName: text,
    productVersionId: text.optional(),
    productName: text,
    policyNumber: z.string().min(4).max(120),
    proposerPartyId: text,
    sumAssuredPaise: money.optional(),
    mode: z.enum(['ANNUAL', 'HALF_YEARLY', 'QUARTERLY', 'MONTHLY', 'SINGLE']),
    commercials: CommercialsSchema,
    nextDueDate: date.optional(),
    maturityDate: date.optional(),
    premiumPayingTermYears: z.number().int().positive().optional(),
    policyTermYears: z.number().int().positive().optional(),
    renewalDate: date.optional(),
    status: StatusSchema.optional(),
    statusAsOf: date.optional(),
    asOf: date,
    confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']).optional(),
    servicingMemberId: text.optional(),
    orgUnitId: text.optional(),
    risk: risk.optional(),
    customFields: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
    distanceSale: z.boolean().optional(),
  })
  .strict();
export const PatchPolicySchema = z
  .object({
    status: StatusSchema.optional(),
    asOf: date.optional(),
    servicingMemberId: text.optional(),
    orgUnitId: text.optional(),
    renewal: z.object({ renewalDate: date, premiumPaise: money }).strict().optional(),
    commercials: CommercialsSchema.optional(),
    risk: risk.optional(),
    customFields: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  })
  .strict();
export const PaymentSchema = z.object({ installmentDue: date, paidOn: date }).strict();
export const WindowSchema = z
  .object({ from: date, to: date })
  .refine((v) => v.from <= v.to && Date.parse(v.to) - Date.parse(v.from) <= 366 * 86400000, 'Window must be ordered and at most 366 days');
export const UploadSchema = z
  .object({
    format: z.enum(['CSV_TEMPLATE', 'LIC_PORTAL', 'GENERIC_PORTAL', 'OFFICE_SALES_REGISTER']),
    fileChecksum: z.string().min(1).max(200),
    asOf: date,
    rows: z
      .array(z.record(z.string(), z.string().max(4000)))
      .min(1)
      .max(5000),
  })
  .strict();
export const MappingSchema = z.object({ mapping: z.record(z.string(), z.string().min(1).max(200)) }).strict();
export const DecisionSchema = z.object({ decision: z.enum(['IMPORT', 'SKIP', 'UPDATE']) }).strict();
export const ReferrerSchema = z.object({ memberId: text.optional(), partyId: text.optional() }).strict();
const requestStatus = z.enum(['OPEN', 'SUBMITTED_TO_INSURER', 'AWAITING_CUSTOMER', 'RESOLVED', 'REJECTED']);
export const ServicingSchema = z
  .object({
    kind: z.enum(['ADDRESS_CHANGE', 'NOMINEE_CHANGE', 'BANK_MANDATE', 'SURRENDER', 'LOAN', 'CLAIM', 'DUPLICATE_POLICY', 'OTHER']),
    insurerRef: text.optional(),
    followUpOn: date.optional(),
    portalUrl: z.string().url().startsWith('https://').optional(),
  })
  .strict();
export const ServicingPatchSchema = z
  .object({
    status: requestStatus.optional(),
    insurerRef: text.optional(),
    followUpOn: date.optional(),
    portalUrl: z.string().url().startsWith('https://').optional(),
  })
  .strict();
export const NoteSchema = z.object({ text: z.string().min(1).max(2000) }).strict();
export const ListPolicySchema = z
  .object({
    partyId: text.optional(),
    line: z.enum(['LIFE', 'HEALTH', 'GENERAL']).optional(),
    status: StatusSchema.optional(),
    q: z.string().max(120).optional(),
    category: z.enum(POLICY_CATEGORIES).optional(),
    businessType: z.enum(BUSINESS_TYPES).optional(),
    businessSource: z.enum(BUSINESS_SOURCES).optional(),
    bookedFrom: date.optional(),
    bookedTo: date.optional(),
    referredBy: z.string().max(120).optional(),
    cursor: text.optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  })
  .passthrough();
