import { z } from 'zod';
import { ValidationError } from '../../../kernel/errors/domain-errors';
import { CallOutcome } from '../domain/outcome';
import { InsurerUrlAllowlist } from './ports';
const text = z.string().min(1);
const instant = z.string().datetime({
  offset: false
});
const money = z.object({
  amountPaise: z.number().int().nonnegative().safe(),
  currency: z.literal('INR')
}).strict();
const target = z.object({
  schemaVersion: z.literal('v1'),
  insurerId: text,
  line: z.enum(['LIFE', 'HEALTH', 'GENERAL'])
});
export const quoteInput = target.extend({
  quoteRequestId: text,
  productVersionId: text,
  requirements: z.record(z.string(), z.unknown())
}).strict();
export const proposalInput = target.extend({
  proposalId: text,
  productVersionId: text,
  quoteOptionId: text,
  templateVersion: text,
  snapshotHash: text,
  answers: z.record(z.string(), z.unknown()),
  parties: z.array(z.object({
    partyId: text,
    role: z.enum(['PROPOSER', 'LIFE_ASSURED', 'INSURED', 'PAYER', 'NOMINEE'])
  }).strict()),
  declarations: z.array(z.object({
    key: text,
    version: text,
    acceptedAt: instant
  }).strict()),
  documents: z.array(z.object({
    kind: text,
    documentRef: text
  }).strict()),
  confirmedAt: instant,
}).strict();
export const statusInput = target.extend({
  insurerRef: text.optional()
}).strict();
export const paymentInput = target.extend({
  proposalId: text,
  insurerRef: text,
  amount: money
}).strict();
export const quoteOutput = z.object({
  schemaVersion: z.literal('v1'),
  insurerQuoteRef: text,
  premium: money,
  validUntil: instant,
  benefitIllustrationRef: text.optional(),
}).strict();
export const submissionOutput = z.object({
  schemaVersion: z.literal('v1'),
  insurerRef: text,
  acknowledgedAt: instant
}).strict();
const statusBase = z.object({
  schemaVersion: z.literal('v1'),
  checkedAt: instant
});
export const statusOutput = z.union([
  statusBase.extend({
    status: z.literal('NOT_FOUND')
  }).strict(),
  statusBase.extend({
    status: z.enum(['RECEIVED', 'UNDERWRITING', 'REQUIREMENTS_PENDING', 'DECLINED']),
    insurerRef: text
  }).strict(),
  statusBase.extend({
    status: z.literal('ISSUED'),
    insurerRef: text,
    policyNumber: text,
    issuedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    documentRef: text,
    premium: money,
    sumAssuredPaise: z.number().int().nonnegative().safe().optional(),
  }).strict(),
]);
export const paymentOutput = z.object({
  url: text,
  expiresAt: instant
}).strict();
export const probeOutput = z.object({ latencyMs: z.number().finite().nonnegative() }).strict();
export const callbackInput = z.object({
  schemaVersion: z.literal('v1'),
  eventId: text,
  occurredAt: instant,
  kind: z.literal('POLICY_STATUS'),
  idempotencyKey: text,
  status: statusOutput,
}).strict();
export function validateInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    throw new ValidationError('validation_failed', 'Invalid integration input');
  return parsed.data;
}
export function validateOutcome<T>(schema: z.ZodType<T>, outcome: CallOutcome<T>): CallOutcome<T> {
  if (outcome.kind === 'unknown') {
    const known = ['timeout', 'connection_reset', 'assisted'].includes(outcome.reason);
    return { kind: 'unknown', reason: known ? outcome.reason : 'connection_reset' };
  }
  if (outcome.kind === 'failure') {
    const safeCodes = new Set(['dependency_unavailable', 'integration_url_invalid', 'adapter_version_unavailable', 'adapter_not_certified']);
    return {
      kind: 'failure',
      retryable: outcome.retryable === true,
      code: safeCodes.has(outcome.code) ? outcome.code : 'dependency_unavailable',
      message: 'Integration call failed',
    };
  }
  const parsed = schema.safeParse(outcome.value);
  if (!parsed.success)
    return {
      kind: 'failure',
      retryable: false,
      code: 'dependency_unavailable',
      message: 'Invalid integration response'
    };
  return {
    kind: 'success',
    value: parsed.data
  };
}
export function validateUrl<T>(outcome: CallOutcome<T>, value: string, insurerId: string, allowlist: InsurerUrlAllowlist): CallOutcome<T> {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && !url.username && !url.password && allowlist[insurerId]?.includes(url.origin))
      return outcome;
  }
  catch {
    // Invalid transport URLs are classified without retaining the value.
  }
  return {
    kind: 'failure',
    retryable: false,
    code: 'integration_url_invalid',
    message: 'Invalid integration URL'
  };
}

export function validateDocumentLinks<T>(outcome: CallOutcome<T>, insurerId: string, allowlist: InsurerUrlAllowlist): CallOutcome<T> {
  if (outcome.kind !== 'success') return outcome;
  const value = outcome.value as Record<string, unknown>;
  for (const field of ['documentRef', 'benefitIllustrationRef']) {
    const reference = value[field];
    if (typeof reference === 'string' && /^[a-z][a-z0-9+.-]*:/i.test(reference)) {
      const result = validateUrl(outcome, reference, insurerId, allowlist);
      if (result.kind === 'failure') return result;
    }
  }
  return outcome;
}
