import { z } from 'zod';

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Purpose = z.enum(['SERVICE', 'MARKETING', 'AI_PROCESSING', 'DATA_SHARING_INSURER']);
const ConsentChannel = z.enum(['WHATSAPP', 'SMS', 'EMAIL', 'CALL', 'ANY']);
const PreferredChannel = z.enum(['WHATSAPP', 'SMS', 'EMAIL', 'CALL']);
const Contact = z.object({ channel: z.enum(['MOBILE', 'EMAIL']), value: z.string().min(3).max(120), isPrimary: z.boolean().optional() }).strict();

export const ConsentSchema = z
  .object({
    purpose: Purpose, channel: ConsentChannel, granted: z.boolean(), noticeVersion: z.string().min(1).max(40),
    source: z.enum(['WEB_FORM', 'ASSISTED', 'IMPORT', 'CUSTOMER_LINK', 'SIGNUP']), evidenceRef: z.string().max(120).optional(),
  })
  .strict();

/** CR-001: values are type-checked against the tenant's definitions by the service (invalid_custom_fields). */
export const CustomFieldsBody = z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]));
export const ReplaceCustomFieldsSchema = z.object({ customFields: CustomFieldsBody }).strict();

export const CreatePartySchema = z
  .object({
    kind: z.enum(['PERSON', 'ORGANISATION']),
    displayName: z.string().max(120),
    contacts: z.array(Contact).min(1).max(5),
    dateOfBirth: IsoDate.optional(),
    pan: z.string().max(10).optional(),
    preferredLanguage: z.string().min(2).max(10).optional(),
    preferredChannel: PreferredChannel.optional(),
    tags: z.array(z.string().min(1).max(40)).max(20).optional(),
    consent: z.array(ConsentSchema).max(10).optional(),
    customFields: CustomFieldsBody.optional(),
    onDuplicate: z.enum(['create', 'reject']).default('create'),
  })
  .strict();

export const ListPartiesQuery = z.object({
  q: z.string().trim().min(1).max(80).optional(),
  tag: z.string().max(40).optional(),
  householdId: z.string().optional(),
  segment: z.enum(['with_dues', 'no_policy']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().optional(),
});

export const PatchPartySchema = z
  .object({
    displayName: z.string().max(120).optional(),
    preferredLanguage: z.string().min(2).max(10).optional(),
    preferredChannel: PreferredChannel.optional(),
    tags: z.array(z.string().min(1).max(40)).max(20).optional(),
    addContact: Contact.optional(),
    removeContactHash: z.string().optional(),
  })
  .strict();

export const SensitiveQuery = z.object({ purpose: z.enum(['PROPOSAL', 'SERVICING', 'DSR']) });
export const ContactabilityQuerySchema = z.object({ channel: z.enum(['WHATSAPP', 'SMS', 'EMAIL', 'CALL']), purpose: Purpose });

export const SuppressionSchema = z
  .object({
    channel: ConsentChannel, value: z.string().max(120).optional(), contactHash: z.string().max(128).optional(),
    reason: z.enum(['DND', 'OPT_OUT', 'BOUNCE', 'DSR', 'COMPLAINT']), to: z.string().datetime().optional(),
  })
  .strict()
  .refine((s) => !!s.value !== !!s.contactHash, { message: 'Give exactly one of value or contactHash', path: ['value'] });

export const PageQuery = z.object({ limit: z.coerce.number().int().min(1).max(100).default(25), cursor: z.string().optional() });

const MergeField = z.enum(['displayName', 'dateOfBirth', 'pan', 'preferredLanguage', 'preferredChannel', 'ownerMemberId']);
export const MergeSchema = z
  .object({ survivor: z.enum(['A', 'B']), choices: z.array(z.object({ field: MergeField, from: z.enum(['A', 'B']) }).strict()).max(6) })
  .strict();

export const CreateHouseholdSchema = z.object({ name: z.string().trim().min(2).max(80), headPartyId: z.string().min(1) }).strict();
export const AddHouseholdMemberSchema = z
  .object({ partyId: z.string().min(1), relation: z.enum(['SELF', 'SPOUSE', 'CHILD', 'PARENT', 'SIBLING', 'OTHER']) })
  .strict();
