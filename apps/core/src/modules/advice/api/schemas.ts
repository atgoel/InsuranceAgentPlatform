import { z } from 'zod';

const Id = z.string().min(1).max(64);
const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const Line = z.enum(['LIFE', 'HEALTH', 'GENERAL']);
const Category = z.enum(['TERM', 'SAVINGS', 'ULIP', 'PENSION', 'CHILD', 'HEALTH_INDIVIDUAL', 'HEALTH_FLOATER', 'STANDARD_HEALTH', 'MOTOR', 'OTHER']);
const Paise = z.number().int();

/** Calculator inputs are validated by the calculators themselves (field errors); here only the shape. */
const CalculatorInput = z.record(z.string(), z.unknown());

export const CalculatorRunSchema = z.object({ input: CalculatorInput, partyId: Id.optional() }).strict();

export const StartAdviceSchema = z.object({ partyId: Id, opportunityId: Id.optional(), line: Line.optional(), category: Category.optional() }).strict();
export const AdviceRunSchema = z.object({ calculator: z.string().min(1).max(40), input: CalculatorInput }).strict();
export const RecommendationSchema = z.object({ versionId: Id, rationale: z.string().max(2000) }).strict();
export const CustomerChoiceSchema = z.object({ versionId: Id, reasonIfDifferent: z.string().max(2000).optional() }).strict();
export const NotesSchema = z.object({ text: z.string().max(5000) }).strict();

export const OpenQuoteSchema = z.object({
  opportunityId: Id,
  insuredPartyIds: z.array(Id).max(10),
  requirements: z.record(z.string().max(60), z.string().max(200)).refine((r) => Object.keys(r).length <= 30, 'At most 30 requirements'),
  adviceRecordId: Id.optional(),
}).strict();

export const QuotesQuery = z.object({ opportunityId: Id }).strict();

export const OptionSchema = z.object({
  versionId: Id,
  source: z.enum(['MANUAL_PORTAL', 'INSURER_API']),
  insurerQuoteRef: z.string().min(1).max(80).optional(),
  sumAssuredPaise: Paise,
  policyTermYears: z.number().int().min(1).max(100).optional(),
  premiumPayingTermYears: z.number().int().min(1).max(100).optional(),
  premium: z.object({
    basePaise: Paise, ridersPaise: Paise, taxPaise: Paise, totalPaise: Paise,
    frequency: z.enum(['ANNUAL', 'HALF_YEARLY', 'QUARTERLY', 'MONTHLY', 'SINGLE']),
  }).strict(),
  coverage: z.array(z.object({ label: z.string().min(1).max(80), value: z.string().min(1).max(200) }).strict()).max(30),
  exclusions: z.array(z.string().min(1).max(300)).max(30),
  waitingPeriods: z.array(z.object({ label: z.string().min(1).max(80), months: z.number().int().min(0).max(240) }).strict()).max(20),
  assumptions: z.record(z.string().max(60), z.string().max(200)).refine((r) => Object.keys(r).length <= 20, 'At most 20 assumptions'),
  validUntil: IsoDate,
}).strict();

export const SelectionSchema = z.object({ optionId: Id }).strict();

export const AttachBiSchema = z.object({ documentRef: z.string().max(64), insurerBiVersion: z.string().max(64) }).strict();
export const AcknowledgeBiSchema = z.object({ method: z.enum(['CUSTOMER_LINK', 'ASSISTED']), evidenceRef: z.string().max(64).optional() }).strict();
