import { CustomFieldDefinition, CustomFieldEntity } from './custom-field';

export interface CustomFieldDefinitionReader {
  /** Active definitions of one entity; runs in the caller's RLS transaction (tenant from tx). */
  activeFor(tx: unknown, entity: CustomFieldEntity): Promise<CustomFieldDefinition[]>;
}
