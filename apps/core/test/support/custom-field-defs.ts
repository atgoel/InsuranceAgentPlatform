import { CustomFieldDefinition, CustomFieldDefinitionReader, CustomFieldEntity } from '../../src/kernel/custom-fields';
import { CUSTOM_FIELD_DEFINITIONS } from '../../src/kernel/tokens';

const AT = '2026-10-01T00:00:00.000Z';
let seq = 0;

type Spec = Pick<CustomFieldDefinition, 'entity' | 'key' | 'type' | 'piiClass'> & Partial<CustomFieldDefinition>;

function def(spec: Spec): CustomFieldDefinition {
  seq += 1;
  return { id: `cfd_TEST${seq}`, label: { en: spec.key }, required: false, reportable: false, version: 1, active: true, createdAt: AT, updatedAt: AT, ...spec };
}

/** Fixed definitions for HTTP component tests (the M01 provider is replaced by this reader). */
export const TEST_DEFINITIONS: CustomFieldDefinition[] = [
  def({ entity: 'party', key: 'segment', type: 'enum', piiClass: 'P0', required: true, enumOptions: [{ value: 'RETAIL', label: { en: 'Retail' } }, { value: 'HNI', label: { en: 'HNI' } }] }),
  def({ entity: 'party', key: 'occupation', type: 'text', piiClass: 'P1' }),
  def({ entity: 'party', key: 'income_paise', type: 'money', piiClass: 'P2' }),
  def({ entity: 'party', key: 'legacy_ref', type: 'text', piiClass: 'P0', active: false }),
  def({ entity: 'lead', key: 'campaign_code', type: 'text', piiClass: 'P0', required: true }),
  def({ entity: 'lead', key: 'source_note', type: 'text', piiClass: 'P1' }),
  def({ entity: 'lead', key: 'budget_paise', type: 'money', piiClass: 'P2' }),
  def({ entity: 'opportunity', key: 'rider_note', type: 'text', piiClass: 'P1' }),
  def({ entity: 'opportunity', key: 'sum_assured_paise', type: 'money', piiClass: 'P2' }),
  def({ entity: 'opportunity', key: 'review_flag', type: 'boolean', piiClass: 'P0' }),
];

export class FixedDefinitionReader implements CustomFieldDefinitionReader {
  constructor(private readonly defs: readonly CustomFieldDefinition[] = TEST_DEFINITIONS) {}

  async activeFor(_tx: unknown, entity: CustomFieldEntity): Promise<CustomFieldDefinition[]> {
    return this.defs.filter((d) => d.entity === entity && d.active);
  }
}

export const customFieldOverrides = (): Array<{ token: symbol; value: unknown }> => [{ token: CUSTOM_FIELD_DEFINITIONS, value: new FixedDefinitionReader() }];
