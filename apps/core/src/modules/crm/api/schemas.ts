import { z } from 'zod';

export const ProductLine = z.enum(['TERM_LIFE', 'SAVINGS_LIFE', 'HEALTH', 'HEALTH_FLOATER', 'CHILD', 'RETIREMENT', 'MOTOR', 'OTHER']);
export const LeadSource = z.enum(['WEB_FORM', 'MICROSITE', 'REFERRAL', 'WALK_IN', 'PHONE', 'EVENT', 'CAMPAIGN', 'IMPORT', 'API']);
const LostReason = z.enum(['BOUGHT_ELSEWHERE', 'PREMIUM_TOO_HIGH', 'DECLINED_BY_UNDERWRITING', 'NOT_REACHABLE', 'POSTPONED', 'NOT_INTERESTED', 'OTHER']);
const ContactChannel = z.enum(['CALL', 'WHATSAPP', 'SMS', 'EMAIL']);
const Pincode = z.string().regex(/^[1-9][0-9]{5}$/);
const Iso = z.string().datetime();

export const CaptureLeadSchema = z
  .object({
    fullName: z.string().trim().min(2).max(120),
    mobile: z.string().max(20).optional(),
    email: z.string().max(120).optional(),
    productInterest: ProductLine,
    pincode: Pincode.optional(),
    language: z.string().min(2).max(10).optional(),
    source: LeadSource,
    campaignId: z.string().max(60).optional(),
    referrerPartyId: z.string().max(60).optional(),
    micrositeMemberId: z.string().max(60).optional(),
    touchRef: z.string().max(120).optional(),
    consent: z
      .object({
        granted: z.boolean(), noticeVersion: z.string().min(1).max(40), channels: z.array(ContactChannel).min(1).max(4),
        purposes: z.array(z.enum(['SERVICE', 'MARKETING'])).min(1).max(2), evidenceRef: z.string().max(120).optional(),
      })
      .strict(),
  })
  .strict();
/** Public form: same fields plus the honeypot; source is fixed by the channel, never trusted for IMPORT. */
export const PublicLeadSchema = CaptureLeadSchema.extend({ website: z.string().max(200).optional(), source: LeadSource.exclude(['IMPORT']) }).strict();

export const ListLeadsQuery = z.object({
  stage: z.string().optional().transform((s) => (s ? s.split(',') : undefined)).pipe(z.array(z.enum(['NEW', 'CONTACTED', 'QUALIFIED', 'CONVERTED', 'LOST'])).optional()),
  owner: z.string().optional(),
  product: ProductLine.optional(),
  source: LeadSource.optional(),
  sla: z.enum(['breached', 'pending']).optional(),
  q: z.string().trim().max(80).optional(),
  sort: z.enum(['createdAt', '-createdAt', 'slaDueAt']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().optional(),
});

export const StageTransitionSchema = z.object({ to: z.enum(['NEW', 'CONTACTED', 'QUALIFIED', 'LOST']), lostReason: LostReason.optional() }).strict();
export const QualificationSchema = z
  .object({
    need: z.enum(['PROTECTION', 'TAX_SAVING', 'CHILD_EDUCATION', 'RETIREMENT', 'HEALTH_COVER', 'VEHICLE']).optional(),
    budgetBand: z.enum(['LT_15K', '15K_30K', 'GT_30K']).optional(),
    timeline: z.enum(['THIS_MONTH', '1_3_MONTHS', 'EXPLORING']).optional(),
    existingCover: z.string().max(200).optional(),
  })
  .strict();
export const TemperatureSchema = z.object({ temperature: z.enum(['HOT', 'WARM', 'COLD']) }).strict();
export const AssignSchema = z.object({ memberId: z.string().min(1) }).strict();
export const BulkAssignSchema = z.object({ leadIds: z.array(z.string().min(1)).min(1).max(200), memberId: z.string().min(1) }).strict();
export const ActivitySchema = z
  .object({
    kind: z.enum(['CALL', 'NOTE', 'WHATSAPP', 'SMS', 'EMAIL', 'MEETING', 'VOICE_NOTE']),
    outcome: z.enum(['CONNECTED', 'NO_ANSWER', 'CALL_BACK', 'WRONG_NUMBER', 'NOT_INTERESTED']).optional(),
    summary: z.string().max(1000).optional(),
    occurredAt: Iso.optional(),
    clientRef: z.string().min(8).max(64).optional(),
  })
  .strict();
export const PartyLinkSchema = z.object({ partyId: z.string().min(1) }).strict();
export const ConversionSchema = z
  .object({
    partyChoice: z.union([z.literal('LEAD_PARTY'), z.object({ existingPartyId: z.string().min(1) }).strict()]),
    productInterest: ProductLine,
    expectedPremiumPaise: z.number().int().min(0).max(1_000_000_000_00),
    startStage: z.enum(['DISCOVERY', 'QUOTE_SHARED']),
  })
  .strict();

export const BoardQuery = z.object({ view: z.literal('board').default('board'), owner: z.string().optional(), product: ProductLine.optional() });
export const OpportunityMoveSchema = z.object({ to: z.enum(['DISCOVERY', 'QUOTE_SHARED', 'PROPOSAL_COMPLETE', 'INSURER_PENDING', 'ISSUED']) }).strict();
export const LossSchema = z.object({ reason: LostReason }).strict();

const TaskKind = z.enum(['CALL', 'WHATSAPP', 'MEETING', 'DOCUMENT', 'FOLLOW_UP', 'RENEWAL']);
export const ListTasksQuery = z.object({
  mine: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),
  bucket: z.enum(['OVERDUE', 'TODAY', 'UPCOMING']).optional(),
  kind: TaskKind.optional(),
  owner: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  cursor: z.string().optional(),
});
export const CreateTaskSchema = z
  .object({
    subjectType: z.enum(['LEAD', 'PARTY', 'OPPORTUNITY', 'DUE', 'PROPOSAL']), subjectId: z.string().min(1), kind: TaskKind,
    title: z.string().trim().min(2).max(140), dueAt: Iso, ownerMemberId: z.string().optional(),
  })
  .strict();
export const PatchTaskSchema = z
  .object({ status: z.enum(['DONE', 'CANCELLED']).optional(), outcome: z.string().max(500).optional(), dueAt: Iso.optional(), ownerMemberId: z.string().optional() })
  .strict();

const Condition = z.object({
  field: z.enum(['productInterest', 'line', 'source', 'pincodePrefix', 'campaignId', 'language']),
  op: z.enum(['eq', 'in', 'startsWith']),
  value: z.union([z.string().max(60), z.array(z.string().max(60)).max(50)]),
}).strict();
export const RoutingRuleSchema = z
  .object({
    id: z.string().min(1).max(40), priority: z.number().int().min(1).max(1000), name: z.string().trim().min(2).max(80), active: z.boolean(),
    conditions: z.array(Condition).max(10), method: z.enum(['ROUND_ROBIN', 'LEAST_LOADED', 'TERRITORY', 'SKILL', 'DIRECT_OWNER']),
    targetOrgUnitId: z.string().optional(), slaMinutes: z.number().int().min(15).max(1440),
    onBreach: z.enum(['NOTIFY_MANAGER', 'NOTIFY_THEN_REASSIGN']), reassignAfterMinutes: z.number().int().min(5).max(2880).optional(),
    capacityPerPerson: z.number().int().min(1).max(500).optional(),
  })
  .strict();
export const RoutingRulesSchema = z.object({ rules: z.array(RoutingRuleSchema).max(50) }).strict();
export const SimulationSchema = z
  .object({
    productInterest: ProductLine, source: LeadSource, pincode: Pincode.optional(), campaignId: z.string().max(60).optional(),
    language: z.string().max(10).optional(), micrositeMemberId: z.string().max(60).optional(),
  })
  .strict();

export const LeadImportSchema = z
  .object({
    fileChecksum: z.string().regex(/^[a-f0-9]{64}$/), sourceTag: z.string().trim().min(2).max(60), consentBasis: z.enum(['CAPTURED_AT_EVENT', 'NONE']),
    noticeVersion: z.string().max(40).optional(), route: z.boolean().optional(),
    rows: z.array(z.object({
      fullName: z.string().max(120), mobile: z.string().max(20).optional(), email: z.string().max(120).optional(),
      productInterest: ProductLine.optional(), pincode: z.string().max(10).optional(),
    }).strict()).min(1).max(5000),
  })
  .strict();
