import { describe, it, expect } from '@jest/globals';
import { ValidationError } from '../errors/domain-errors';
import { CustomFieldDefinition, CustomFieldType, PiiClass } from './custom-field';
import { CustomFieldValidator } from './custom-field-validator';

function thrown(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error('expected function to throw');
}

function mk(key: string, type: CustomFieldType, extra: Partial<CustomFieldDefinition> = {}): CustomFieldDefinition {
  return {
    id: `cfd_${key}`,
    entity: 'held_policy',
    key,
    label: { en: key },
    type,
    required: false,
    piiClass: 'P1' as PiiClass,
    reportable: false,
    version: 1,
    active: true,
    createdAt: '2026-10-03T10:00:00.000Z',
    updatedAt: '2026-10-03T10:00:00.000Z',
    ...extra,
  };
}

const defs: CustomFieldDefinition[] = [
  mk('note', 'text'),
  mk('score', 'number'),
  mk('amount', 'money'),
  mk('due', 'date'),
  mk('grade', 'enum', { enumOptions: [{ value: 'A', label: { en: 'A' } }, { value: 'B', label: { en: 'B' } }] }),
  mk('vip', 'boolean'),
];

function errorsOf(values: unknown, d: readonly CustomFieldDefinition[] = defs): string[] {
  const error = thrown(() => CustomFieldValidator.validate(d, values)) as ValidationError;
  expect(error).toBeInstanceOf(ValidationError);
  expect(error.code).toBe('invalid_custom_fields');
  return error.errors.map((e) => `${e.path}:${e.code}`);
}

describe('AC-CR001-04 CustomFieldValidator.validate', () => {
  it('AC-CR001-04 accepts valid values of every type', () => {
    const values = { note: 'hello', score: 4.5, amount: 150_000, due: '2026-10-03', grade: 'A', vip: false };
    expect(CustomFieldValidator.validate(defs, values)).toEqual(values);
  });

  it('AC-CR001-04 drops null and undefined values', () => {
    expect(CustomFieldValidator.validate(defs, { note: null, score: undefined, vip: true })).toEqual({ vip: true });
  });

  it('AC-CR001-04 non-object input is invalid_custom_fields', () => {
    for (const bad of ['x', 5, null, undefined, [], [1]]) {
      const error = thrown(() => CustomFieldValidator.validate(defs, bad)) as ValidationError;
      expect(error.code).toBe('invalid_custom_fields');
      expect(error.errors).toEqual([]);
    }
  });

  it('AC-CR001-04 unknown keys are rejected', () => {
    expect(errorsOf({ nope: 1 })).toEqual(['customFields.nope:unknown_custom_field']);
    const inactiveOnly = [mk('old', 'text', { active: true })];
    expect(errorsOf({ other: 'x' }, inactiveOnly)).toEqual(['customFields.other:unknown_custom_field']);
  });

  it('AC-CR001-04 required fields must be present', () => {
    const required = [mk('must', 'text', { required: true }), mk('opt', 'text')];
    expect(errorsOf({}, required)).toEqual(['customFields.must:required']);
    expect(errorsOf({ must: null }, required)).toEqual(['customFields.must:required']);
    expect(CustomFieldValidator.validate(required, { must: 'v' })).toEqual({ must: 'v' });
  });

  it('AC-CR001-04 type errors per field', () => {
    expect(
      errorsOf({ note: 5, score: '4', amount: '10', due: 20260101, grade: 1, vip: 'yes' }),
    ).toEqual([
      'customFields.note:invalid_type',
      'customFields.score:invalid_type',
      'customFields.amount:invalid_type',
      'customFields.due:invalid_type',
      'customFields.grade:invalid_type',
      'customFields.vip:invalid_type',
    ]);
    expect(errorsOf({ score: Number.NaN })).toEqual(['customFields.score:invalid_type']);
    expect(errorsOf({ score: Infinity })).toEqual(['customFields.score:invalid_type']);
  });

  it('AC-CR001-04 text over 500 chars is too long, exactly 500 is fine', () => {
    expect(errorsOf({ note: 'a'.repeat(501) })).toEqual(['customFields.note:text_too_long']);
    expect(CustomFieldValidator.validate(defs, { note: 'a'.repeat(500) }).note).toHaveLength(500);
  });

  it('AC-CR001-04 PAN, Aadhaar and card numbers in text are sensitive_content', () => {
    expect(errorsOf({ note: 'PAN ABCDE1234F' })).toEqual(['customFields.note:sensitive_content']);
    expect(errorsOf({ note: 'aadhaar 1234 5678 9012' })).toEqual(['customFields.note:sensitive_content']);
    expect(errorsOf({ note: 'card 1234 5678 9012 3456' })).toEqual(['customFields.note:sensitive_content']);
  });

  it('AC-CR001-04 dates must be real calendar dates', () => {
    expect(errorsOf({ due: '2026-02-30' })).toEqual(['customFields.due:invalid_date']);
    expect(errorsOf({ due: '3/10/2026' })).toEqual(['customFields.due:invalid_date']);
  });

  it('AC-CR001-04 money must be an integer', () => {
    expect(errorsOf({ amount: 10.5 })).toEqual(['customFields.amount:money_not_integer']);
    expect(errorsOf({ amount: Number.MAX_SAFE_INTEGER + 2 })).toEqual(['customFields.amount:money_not_integer']);
  });

  it('AC-CR001-04 enum value must be a declared option', () => {
    expect(errorsOf({ grade: 'C' })).toEqual(['customFields.grade:invalid_enum_value']);
  });

  it('AC-CR001-04 collects all errors in one ValidationError', () => {
    expect(errorsOf({ nope: 1, grade: 'Z', amount: 1.5 })).toEqual([
      'customFields.nope:unknown_custom_field',
      'customFields.grade:invalid_enum_value',
      'customFields.amount:money_not_integer',
    ]);
  });
});

describe('AC-CR001-05 mask, visible and reportable', () => {
  const p2 = mk('secret', 'text', { piiClass: 'P2' });
  const rep = mk('metric', 'number', { reportable: true });
  const plain = mk('plain', 'text');
  const all = [p2, rep, plain];
  const values = { secret: 'confidential', metric: 7, plain: 'p', hidden: 'gone' };

  it('AC-CR001-05 mask hides P2 values and drops keys without an active definition', () => {
    expect(CustomFieldValidator.mask(all, values)).toEqual({ secret: '****', metric: 7, plain: 'p' });
  });

  it('AC-CR001-05 visible returns unmasked values of active definitions only', () => {
    expect(CustomFieldValidator.visible(all, values)).toEqual({ secret: 'confidential', metric: 7, plain: 'p' });
  });

  it('AC-CR001-05 reportable never returns P2 keys, even if a definition is flagged reportable', () => {
    expect(CustomFieldValidator.reportable(all, values)).toEqual({ metric: 7 });
    const badFlag = mk('secret', 'text', { piiClass: 'P2', reportable: true });
    expect(CustomFieldValidator.reportable([badFlag, rep], values)).toEqual({ metric: 7 });
  });
});
