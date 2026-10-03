import { BusinessRuleError, ConflictError, ValidationError } from '../errors/domain-errors';

export const CUSTOM_FIELD_ENTITIES = ['held_policy', 'policy_sale', 'party', 'lead', 'opportunity', 'commission_entry'] as const;
export type CustomFieldEntity = (typeof CUSTOM_FIELD_ENTITIES)[number];
export type CustomFieldType = 'text' | 'number' | 'money' | 'date' | 'enum' | 'boolean';
export type PiiClass = 'P0' | 'P1' | 'P2' | 'P3';
export interface LocalisedLabel { en: string; hi?: string }

export interface CustomFieldDefinition {
  id: string;
  entity: CustomFieldEntity;
  key: string;
  label: LocalisedLabel;
  type: CustomFieldType;
  enumOptions?: Array<{ value: string; label: LocalisedLabel }>;
  required: boolean;
  piiClass: PiiClass;
  reportable: boolean;
  version: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export type CustomFieldValue = string | number | boolean;
export type CustomFieldValues = Record<string, CustomFieldValue>;

export interface DefineCustomFieldInput {
  entity: CustomFieldEntity;
  key: string;
  label: LocalisedLabel;
  type: CustomFieldType;
  enumOptions?: CustomFieldDefinition['enumOptions'];
  required?: boolean;
  piiClass: PiiClass;
  reportable?: boolean;
}

export interface ReviseCustomFieldInput {
  label?: LocalisedLabel;
  enumOptions?: CustomFieldDefinition['enumOptions'];
  required?: boolean;
  reportable?: boolean;
  active?: boolean;
}

const KEY_PATTERN = /^[a-z][a-z0-9_]{1,39}$/;
const ENUM_VALUE_PATTERN = /^[A-Z0-9_]{1,40}$/;

function normaliseLabel(label: LocalisedLabel): LocalisedLabel {
  const en = typeof label?.en === 'string' ? label.en.trim() : '';
  if (en.length < 1 || en.length > 60) throw new ValidationError('invalid_label', 'Label (en) must be 1 to 60 characters');
  if (label.hi === undefined) return { en };
  if (typeof label.hi !== 'string' || label.hi.length > 60) {
    throw new ValidationError('invalid_label', 'Label (hi) must be at most 60 characters');
  }
  return { en, hi: label.hi };
}

function normaliseOptions(options: CustomFieldDefinition['enumOptions']): NonNullable<CustomFieldDefinition['enumOptions']> {
  if (!Array.isArray(options) || options.length < 1 || options.length > 50) {
    throw new ValidationError('invalid_enum_options', 'Enum needs 1 to 50 options');
  }
  const seen = new Set<string>();
  return options.map((option) => {
    if (typeof option.value !== 'string' || !ENUM_VALUE_PATTERN.test(option.value) || seen.has(option.value)) {
      throw new ValidationError('invalid_enum_options', 'Enum option values must be unique and match /^[A-Z0-9_]{1,40}$/');
    }
    seen.add(option.value);
    return { value: option.value, label: normaliseLabel(option.label) };
  });
}

function activeCount(existing: readonly CustomFieldDefinition[], exceptId?: string): number {
  return existing.filter((def) => def.active && def.id !== exceptId).length;
}

function assertBelowLimit(existing: readonly CustomFieldDefinition[], limit: number, exceptId?: string): void {
  if (activeCount(existing, exceptId) >= limit) {
    throw new BusinessRuleError('custom_field_limit_reached', 'Custom field limit reached', { limit });
  }
}

function optionsForDefine(input: DefineCustomFieldInput): CustomFieldDefinition['enumOptions'] {
  if (input.type === 'enum') return normaliseOptions(input.enumOptions);
  if (input.enumOptions !== undefined) throw new ValidationError('invalid_enum_options', 'Options are only allowed on enum fields');
  return undefined;
}

function optionsForRevise(def: CustomFieldDefinition, patch: ReviseCustomFieldInput): CustomFieldDefinition['enumOptions'] {
  if (patch.enumOptions === undefined) return def.enumOptions;
  if (def.type !== 'enum') throw new ValidationError('invalid_enum_options', 'Options are only allowed on enum fields');
  const next = normaliseOptions(patch.enumOptions);
  const kept = new Set(next.map((option) => option.value));
  const removed = (def.enumOptions ?? []).filter((option) => !kept.has(option.value)).map((option) => option.value);
  if (removed.length > 0) throw new ValidationError('enum_option_removed', 'Enum options cannot be removed', [], { removed });
  return next;
}

function assertP2NotReportable(piiClass: PiiClass, reportable: boolean): void {
  if (piiClass === 'P2' && reportable) {
    throw new ValidationError('p2_not_reportable', 'A P2 field cannot be reportable');
  }
}

// eslint-disable-next-line max-params -- signature fixed by M00 §16.5
export function defineCustomField(
  input: DefineCustomFieldInput,
  existing: readonly CustomFieldDefinition[],
  limit: number,
  id: string,
  now: Date,
): CustomFieldDefinition {
  if (input.piiClass === 'P3') throw new ValidationError('pii_class_not_allowed', 'P3 fields are not allowed');
  const reportable = input.reportable ?? false;
  assertP2NotReportable(input.piiClass, reportable);
  if (typeof input.key !== 'string' || !KEY_PATTERN.test(input.key)) {
    throw new ValidationError('invalid_custom_field_key', 'Key must match /^[a-z][a-z0-9_]{1,39}$/');
  }
  const label = normaliseLabel(input.label);
  const enumOptions = optionsForDefine(input);
  if (existing.some((def) => def.entity === input.entity && def.key === input.key)) {
    throw new ConflictError('custom_field_exists', `Custom field ${input.key} already exists on ${input.entity}`);
  }
  assertBelowLimit(existing, limit);
  const iso = now.toISOString();
  return {
    id,
    entity: input.entity,
    key: input.key,
    label,
    type: input.type,
    ...(enumOptions ? { enumOptions } : {}),
    required: input.required ?? false,
    piiClass: input.piiClass,
    reportable,
    version: 1,
    active: true,
    createdAt: iso,
    updatedAt: iso,
  };
}

// eslint-disable-next-line max-params -- signature fixed by M00 §16.5
export function reviseCustomField(
  def: CustomFieldDefinition,
  patch: ReviseCustomFieldInput,
  existing: readonly CustomFieldDefinition[],
  limit: number,
  now: Date,
): CustomFieldDefinition {
  const reportable = patch.reportable ?? def.reportable;
  assertP2NotReportable(def.piiClass, reportable);
  const label = patch.label !== undefined ? normaliseLabel(patch.label) : def.label;

  const enumOptions = optionsForRevise(def, patch);

  const active = patch.active ?? def.active;
  if (active && !def.active) assertBelowLimit(existing, limit, def.id);

  return {
    ...def,
    label,
    ...(enumOptions ? { enumOptions } : {}),
    required: patch.required ?? def.required,
    reportable,
    active,
    version: def.version + 1,
    updatedAt: now.toISOString(),
  };
}
