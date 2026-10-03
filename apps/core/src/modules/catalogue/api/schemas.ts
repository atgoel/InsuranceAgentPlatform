import { z } from 'zod';

const Line = z.enum(['LIFE', 'HEALTH', 'GENERAL']);
const Category = z.enum(['TERM', 'SAVINGS', 'ULIP', 'PENSION', 'CHILD', 'HEALTH_INDIVIDUAL', 'HEALTH_FLOATER', 'STANDARD_HEALTH', 'MOTOR', 'OTHER']);
const Channel = z.enum(['IMF', 'BROKER', 'INDIVIDUAL_AGENT', 'CORPORATE_AGENT']);
const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const Id = z.string().regex(/^[a-z][a-z0-9_]{2,63}$/, 'Lower-case id');
const KeyFacts = z.array(z.object({ label: z.string().min(1).max(80), value: z.string().min(1).max(200) })).max(30);

export const CatalogueQuery = z.object({ line: Line.optional(), category: Category.optional(), insurerId: z.string().max(64).optional() }).strict();
export const ResearchQuery = z.object({ line: Line.optional(), q: z.string().max(100).optional() }).strict();
export const EvaluationSchema = z.object({ line: Line.optional(), category: Category.optional(), date: IsoDate.optional() }).strict();

export const InsurerSchema = z.object({
  id: Id, name: z.string().min(2).max(120), irdaiRegNo: z.string().min(1).max(20), lines: z.array(Line).min(1), active: z.boolean(),
}).strict();

export const ProductSchema = z.object({ id: Id, insurerId: Id, line: Line, name: z.string().min(2).max(120), category: Category }).strict();

export const VersionSchema = z.object({
  productId: Id,
  uin: z.string().min(6).max(30),
  wordingVersion: z.string().min(1).max(20),
  wordingUrl: z.string().url().optional(),
  posEligible: z.boolean(),
  channels: z.array(Channel).min(1),
  effectiveFrom: IsoDate,
  effectiveTo: IsoDate.optional(),
  quoteRequirements: z.array(z.string().min(1).max(40)).max(30).default([]),
  keyFacts: KeyFacts.default([]),
}).strict();

export const VersionPatchSchema = z.object({
  keyFacts: KeyFacts.optional(),
  quoteRequirements: z.array(z.string().min(1).max(40)).max(30).optional(),
  wordingUrl: z.string().url().optional(),
  channels: z.array(Channel).min(1).optional(),
  posEligible: z.boolean().optional(),
}).strict();

export const WithdrawalSchema = z.object({ on: IsoDate.optional() }).strict();

export const ResearchSchema = z.object({
  summary: z.string().min(10).max(1000),
  points: z.array(z.string().min(1).max(200)).min(1).max(10),
  sourceRef: z.string().min(1).max(200),
  sourceDate: IsoDate,
}).strict();
