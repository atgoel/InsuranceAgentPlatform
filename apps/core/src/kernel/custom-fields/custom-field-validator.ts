import { SensitiveContentGuard } from '../domain/sensitive-content';
import { BusinessRuleError, FieldError, ValidationError } from '../errors/domain-errors';
import { CustomFieldDefinition, CustomFieldValue, CustomFieldValues } from './custom-field';

const MASK = '****';
const MAX_TEXT = 500;

function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function checkText(value: unknown): string | undefined {
  if (typeof value !== 'string') return 'invalid_type';
  if (value.length > MAX_TEXT) return 'text_too_long';
  try {
    SensitiveContentGuard.check(value);
  } catch (error) {
    if (error instanceof BusinessRuleError) return 'sensitive_content';
    throw error;
  }
  return undefined;
}

function checkMoney(value: unknown): string | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'invalid_type';
  return Number.isSafeInteger(value) ? undefined : 'money_not_integer';
}

function checkDate(value: unknown): string | undefined {
  if (typeof value !== 'string') return 'invalid_type';
  return isRealDate(value) ? undefined : 'invalid_date';
}

function checkEnum(def: CustomFieldDefinition, value: unknown): string | undefined {
  if (typeof value !== 'string') return 'invalid_type';
  return (def.enumOptions ?? []).some((option) => option.value === value) ? undefined : 'invalid_enum_value';
}

function checkValue(def: CustomFieldDefinition, value: unknown): string | undefined {
  switch (def.type) {
    case 'text':
      return checkText(value);
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) ? undefined : 'invalid_type';
    case 'money':
      return checkMoney(value);
    case 'date':
      return checkDate(value);
    case 'enum':
      return checkEnum(def, value);
    case 'boolean':
      return typeof value === 'boolean' ? undefined : 'invalid_type';
  }
}

function collectValues(
  byKey: ReadonlyMap<string, CustomFieldDefinition>,
  values: Record<string, unknown>,
  errors: FieldError[],
): CustomFieldValues {
  const result: CustomFieldValues = {};
  for (const [key, value] of Object.entries(values)) {
    if (value === null || value === undefined) continue;
    const def = byKey.get(key);
    const path = `customFields.${key}`;
    const code = def ? checkValue(def, value) : 'unknown_custom_field';
    if (code) errors.push({ path, code, message: `Invalid value for ${key}: ${code}` });
    else result[key] = value as CustomFieldValue;
  }
  return result;
}

export class CustomFieldValidator {
  static validate(defs: readonly CustomFieldDefinition[], values: unknown): CustomFieldValues {
    if (!isPlainObject(values)) {
      throw new ValidationError('invalid_custom_fields', 'customFields must be an object');
    }
    const byKey = new Map(defs.map((def) => [def.key, def]));
    const errors: FieldError[] = [];
    const result = collectValues(byKey, values, errors);

    for (const def of defs) {
      const path = `customFields.${def.key}`;
      if (def.required && !(def.key in result) && !errors.some((e) => e.path === path)) {
        errors.push({ path, code: 'required', message: `${def.key} is required` });
      }
    }

    if (errors.length > 0) throw new ValidationError('invalid_custom_fields', 'Custom fields are invalid', errors);
    return result;
  }

  static mask(defs: readonly CustomFieldDefinition[], values: CustomFieldValues): CustomFieldValues {
    const out: CustomFieldValues = {};
    for (const def of defs) {
      if (Object.prototype.hasOwnProperty.call(values, def.key)) out[def.key] = def.piiClass === 'P2' ? MASK : values[def.key];
    }
    return out;
  }

  static visible(defs: readonly CustomFieldDefinition[], values: CustomFieldValues): CustomFieldValues {
    const out: CustomFieldValues = {};
    for (const def of defs) {
      if (Object.prototype.hasOwnProperty.call(values, def.key)) out[def.key] = values[def.key];
    }
    return out;
  }

  static reportable(defs: readonly CustomFieldDefinition[], values: CustomFieldValues): CustomFieldValues {
    const out: CustomFieldValues = {};
    for (const def of defs) {
      if (def.reportable && def.piiClass !== 'P2' && Object.prototype.hasOwnProperty.call(values, def.key)) {
        out[def.key] = values[def.key];
      }
    }
    return out;
  }
}
