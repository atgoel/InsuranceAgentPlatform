import { describe, it, expect } from '@jest/globals';
import { BusinessRuleError, ConflictError, ValidationError } from '../errors/domain-errors';
import { CustomFieldDefinition, DefineCustomFieldInput, defineCustomField, reviseCustomField } from './custom-field';

function thrown(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error('expected function to throw');
}

const NOW = new Date('2026-10-03T10:00:00.000Z');
const LATER = new Date('2026-10-04T10:00:00.000Z');

const input: DefineCustomFieldInput = {
  entity: 'held_policy',
  key: 'branch_note',
  label: { en: '  Branch note  ' },
  type: 'text',
  piiClass: 'P1',
};

function def(overrides: Partial<DefineCustomFieldInput> = {}, existing: CustomFieldDefinition[] = [], limit = 10, id = 'cfd_1'): CustomFieldDefinition {
  return defineCustomField({ ...input, ...overrides }, existing, limit, id, NOW);
}

describe('AC-CR001-04 defineCustomField', () => {
  it('AC-CR001-04 creates version 1, active, with defaults and timestamps', () => {
    const created = def();
    expect(created).toEqual({
      id: 'cfd_1',
      entity: 'held_policy',
      key: 'branch_note',
      label: { en: 'Branch note' },
      type: 'text',
      required: false,
      piiClass: 'P1',
      reportable: false,
      version: 1,
      active: true,
      createdAt: '2026-10-03T10:00:00.000Z',
      updatedAt: '2026-10-03T10:00:00.000Z',
    });
  });

  it('AC-CR001-04 refuses P3', () => {
    const error = thrown(() => def({ piiClass: 'P3' })) as ValidationError;
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.code).toBe('pii_class_not_allowed');
  });

  it('AC-CR001-04 refuses P2 + reportable but allows P2 and P1 reportable', () => {
    expect((thrown(() => def({ piiClass: 'P2', reportable: true })) as ValidationError).code).toBe('p2_not_reportable');
    expect(def({ piiClass: 'P2' }).reportable).toBe(false);
    expect(def({ piiClass: 'P1', reportable: true }).reportable).toBe(true);
  });

  it('AC-CR001-04 refuses bad keys', () => {
    for (const key of ['A', 'a', '1abc', 'Bad_Key', 'x'.repeat(41), 'has-dash']) {
      expect((thrown(() => def({ key })) as ValidationError).code).toBe('invalid_custom_field_key');
    }
    expect(def({ key: 'x'.repeat(40) }).key).toBe('x'.repeat(40));
  });

  it('AC-CR001-04 refuses bad labels', () => {
    expect((thrown(() => def({ label: { en: '   ' } })) as ValidationError).code).toBe('invalid_label');
    expect((thrown(() => def({ label: { en: 'x'.repeat(61) } })) as ValidationError).code).toBe('invalid_label');
    expect((thrown(() => def({ label: { en: 'ok', hi: 'h'.repeat(61) } })) as ValidationError).code).toBe('invalid_label');
    expect(def({ label: { en: 'x'.repeat(60), hi: 'h'.repeat(60) } }).label.hi).toBe('h'.repeat(60));
  });

  it('AC-CR001-04 enum needs 1..50 unique valid options; options only on enum', () => {
    const opt = (value: string): { value: string; label: { en: string } } => ({ value, label: { en: value } });
    expect((thrown(() => def({ type: 'enum' })) as ValidationError).code).toBe('invalid_enum_options');
    expect((thrown(() => def({ type: 'enum', enumOptions: [] })) as ValidationError).code).toBe('invalid_enum_options');
    expect((thrown(() => def({ type: 'enum', enumOptions: [opt('A'), opt('A')] })) as ValidationError).code).toBe('invalid_enum_options');
    expect((thrown(() => def({ type: 'enum', enumOptions: [opt('lower')] })) as ValidationError).code).toBe('invalid_enum_options');
    const fifty = Array.from({ length: 50 }, (_, i) => opt(`V${i}`));
    expect(def({ type: 'enum', enumOptions: fifty }).enumOptions).toHaveLength(50);
    expect((thrown(() => def({ type: 'enum', enumOptions: [...fifty, opt('V50')] })) as ValidationError).code).toBe('invalid_enum_options');
    expect((thrown(() => def({ type: 'text', enumOptions: [opt('A')] })) as ValidationError).code).toBe('invalid_enum_options');
  });

  it('AC-CR001-04 duplicate entity+key conflicts even when inactive; same key on another entity is fine', () => {
    const inactive = { ...def(), active: false };
    const error = thrown(() => def({}, [inactive], 10, 'cfd_2')) as ConflictError;
    expect(error).toBeInstanceOf(ConflictError);
    expect(error.code).toBe('custom_field_exists');
    expect(def({ entity: 'party' }, [inactive], 10, 'cfd_2').entity).toBe('party');
  });

  it('AC-CR001-04 limit reached at exactly limit active definitions', () => {
    const one = def({ key: 'field_one' }, [], 2, 'cfd_1');
    const two = def({ key: 'field_two' }, [one], 2, 'cfd_2');
    const error = thrown(() => def({ key: 'field_three' }, [one, two], 2, 'cfd_3')) as BusinessRuleError;
    expect(error).toBeInstanceOf(BusinessRuleError);
    expect(error.code).toBe('custom_field_limit_reached');
    expect(error.details).toEqual({ limit: 2 });
    // inactive definitions do not count
    expect(def({ key: 'field_three' }, [one, { ...two, active: false }], 2, 'cfd_3').key).toBe('field_three');
  });
});

describe('AC-CR001-04 reviseCustomField', () => {
  const opt = (value: string): { value: string; label: { en: string } } => ({ value, label: { en: value } });
  const enumDef = def({ type: 'enum', key: 'grade', enumOptions: [opt('A'), opt('B')] });

  it('AC-CR001-04 bumps version and updatedAt, keeps immutable fields', () => {
    const revised = reviseCustomField(def(), { label: { en: 'New label' }, required: true, reportable: true }, [], 10, LATER);
    expect(revised.version).toBe(2);
    expect(revised.updatedAt).toBe('2026-10-04T10:00:00.000Z');
    expect(revised.createdAt).toBe('2026-10-03T10:00:00.000Z');
    expect(revised.label).toEqual({ en: 'New label' });
    expect(revised.required).toBe(true);
    expect(revised.reportable).toBe(true);
    expect([revised.key, revised.entity, revised.type, revised.piiClass]).toEqual(['branch_note', 'held_policy', 'text', 'P1']);
  });

  it('AC-CR001-04 key, type and piiClass cannot be patched (ignored)', () => {
    const patch = { type: 'number', key: 'other_key', piiClass: 'P0' } as unknown as Parameters<typeof reviseCustomField>[1];
    const revised = reviseCustomField(def(), patch, [], 10, LATER);
    expect([revised.key, revised.type, revised.piiClass]).toEqual(['branch_note', 'text', 'P1']);
  });

  it('AC-CR001-04 refuses removing an enum value, allows adding and relabelling', () => {
    const removed = thrown(() => reviseCustomField(enumDef, { enumOptions: [opt('A')] }, [], 10, LATER)) as ValidationError;
    expect(removed.code).toBe('enum_option_removed');
    expect(removed.details).toEqual({ removed: ['B'] });
    const next = reviseCustomField(enumDef, { enumOptions: [{ value: 'A', label: { en: 'Alpha' } }, opt('B'), opt('C')] }, [], 10, LATER);
    expect(next.enumOptions?.map((o) => o.value)).toEqual(['A', 'B', 'C']);
    expect(next.enumOptions?.[0].label.en).toBe('Alpha');
  });

  it('AC-CR001-04 options on a non-enum are refused', () => {
    expect((thrown(() => reviseCustomField(def(), { enumOptions: [opt('A')] }, [], 10, LATER)) as ValidationError).code).toBe('invalid_enum_options');
  });

  it('AC-CR001-04 P2 field cannot become reportable; bad label refused', () => {
    const p2 = def({ piiClass: 'P2' });
    expect((thrown(() => reviseCustomField(p2, { reportable: true }, [], 10, LATER)) as ValidationError).code).toBe('p2_not_reportable');
    expect((thrown(() => reviseCustomField(def(), { label: { en: '' } }, [], 10, LATER)) as ValidationError).code).toBe('invalid_label');
  });

  it('AC-CR001-04 reactivation is refused at the limit and allowed below it', () => {
    const inactive = { ...def({ key: 'old_field' }), active: false };
    const other = def({ key: 'other_field' }, [], 10, 'cfd_9');
    const error = thrown(() => reviseCustomField(inactive, { active: true }, [inactive, other], 1, LATER)) as BusinessRuleError;
    expect(error.code).toBe('custom_field_limit_reached');
    expect(error.details).toEqual({ limit: 1 });
    expect(reviseCustomField(inactive, { active: true }, [inactive, other], 2, LATER).active).toBe(true);
    expect(reviseCustomField(def(), { active: false }, [def()], 1, LATER).active).toBe(false);
  });
});
