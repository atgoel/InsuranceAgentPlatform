import { z } from 'zod';
import { APPROVED_TYPEFACES } from '../domain/brand-kit';
import { PhoneNumber } from '../../../kernel/domain/phone-number';

const IndianMobile = z.string().refine((v) => {
  try {
    PhoneNumber.parse(v);
    return true;
  } catch {
    return false;
  }
}, { message: 'Enter a valid Indian mobile number' });

const PlanCode = z.enum(['SOLO', 'SOLO_PRO', 'TEAM', 'BUSINESS', 'WHITE_LABEL', 'DEDICATED']);
const Line = z.enum(['LIFE', 'HEALTH', 'GENERAL']);
const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
const HexColour = z.string().regex(/^#[0-9A-Fa-f]{6}$/);
export const FlagKey = z.enum(['online_purchase', 'referral_rewards', 'ai_skills', 'whatsapp_api', 'book_import_ai', 'twenty_ui']);

export const ProvisionTenantSchema = z
  .object({
    slug: z.string().min(3).max(32),
    displayName: z.string().trim().min(2).max(120),
    kind: z.enum(['ORGANISATION', 'SOLO']),
    planCode: PlanCode,
    entity: z
      .object({
        entityType: z.enum(['IMF', 'BROKER', 'INDIVIDUAL_AGENT', 'CORPORATE_AGENT']),
        legalName: z.string().trim().min(2).max(200),
        registrationNo: z.string().trim().min(3).max(40),
        registrationValidTo: IsoDate,
        principalOfficerName: z.string().trim().min(2).max(120).optional(),
      })
      .strict(),
    admin: z.object({ name: z.string().trim().min(1).max(120), phone: z.string().optional(), email: z.string().email().optional() }).strict(),
  })
  .strict();

export const ListTenantsQuery = z.object({
  status: z.enum(['provisioning', 'active', 'suspended', 'offboarded']).optional(),
  kind: z.enum(['ORGANISATION', 'SOLO']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().optional(),
});

export const StatusTransitionSchema = z.object({ to: z.enum(['suspended', 'active', 'offboarded']), reason: z.string().trim().min(3).max(200) }).strict();
export const ChangePlanSchema = z.object({ planCode: PlanCode }).strict();

export const TieUpsSchema = z
  .object({
    tieUps: z.array(z.object({ insurerId: z.string().min(1).max(64), line: Line, effectiveFrom: IsoDate, effectiveTo: IsoDate.optional() }).strict()).max(60),
  })
  .strict();

export const ComplianceReviewSchema = z.object({ reviewRef: z.string().trim().min(3).max(80) }).strict();
export const SetFlagSchema = z.object({ enabled: z.boolean() }).strict();

export const BrandKitSchema = z
  .object({
    brandName: z.string().trim().min(2).max(80),
    primary: HexColour,
    secondary: HexColour,
    typeface: z.enum(APPROVED_TYPEFACES),
    logoRef: z.string().max(200).optional(),
    poweredByVisible: z.boolean(),
  })
  .strict();

export const TrialSchema = z.object({ planCode: z.literal('SOLO_PRO') }).strict();

export const StartSignupSchema = z
  .object({
    phone: IndianMobile,
    displayName: z.string().trim().min(2).max(80),
    licence: z.object({ insurerName: z.string().trim().min(2).max(80), line: Line, licenceNo: z.string().trim().min(3).max(40) }).strict(),
    consent: z.object({ noticeVersion: z.string().min(1).max(20), accepted: z.literal(true) }).strict(),
  })
  .strict();

export const VerifySignupSchema = z.object({ otp: z.string().regex(/^\d{6}$/) }).strict();
