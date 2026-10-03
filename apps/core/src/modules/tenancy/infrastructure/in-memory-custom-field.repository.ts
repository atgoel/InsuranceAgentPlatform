import { Injectable } from '@nestjs/common';
import { CustomFieldDefinition, CustomFieldEntity } from '../../../kernel/custom-fields';
import { ConflictError, NotFoundError, PreconditionFailedError } from '../../../kernel/errors/domain-errors';
import { Transaction } from '../../../kernel/persistence/unit-of-work';
import { CustomFieldRepository } from '../application/ports';

const copy = (d: CustomFieldDefinition): CustomFieldDefinition => structuredClone(d);

/** Custom field definitions held per tenant (the transaction names the tenant). */
@Injectable()
export class InMemoryCustomFieldRepository implements CustomFieldRepository {
  private readonly byTenant = new Map<string, Map<string, CustomFieldDefinition>>();

  private bucket(tx: Transaction): Map<string, CustomFieldDefinition> {
    let b = this.byTenant.get(tx.tenantId);
    if (!b) {
      b = new Map();
      this.byTenant.set(tx.tenantId, b);
    }
    return b;
  }

  async list(tx: Transaction): Promise<CustomFieldDefinition[]> {
    return [...this.bucket(tx).values()]
      .sort((a, b) => (a.entity === b.entity ? a.key.localeCompare(b.key) : a.entity.localeCompare(b.entity)))
      .map(copy);
  }

  async activeFor(tx: unknown, entity: CustomFieldEntity): Promise<CustomFieldDefinition[]> {
    return (await this.list(tx as Transaction)).filter((d) => d.entity === entity && d.active);
  }

  async get(tx: Transaction, id: string): Promise<CustomFieldDefinition | undefined> {
    const found = this.bucket(tx).get(id);
    return found && copy(found);
  }

  async insert(tx: Transaction, def: CustomFieldDefinition): Promise<void> {
    const b = this.bucket(tx);
    if ([...b.values()].some((d) => d.entity === def.entity && d.key === def.key) || b.has(def.id)) {
      throw new ConflictError('custom_field_exists', `Custom field ${def.key} already exists on ${def.entity}`);
    }
    b.set(def.id, copy(def));
  }

  async update(tx: Transaction, def: CustomFieldDefinition, expectedVersion: number): Promise<void> {
    const b = this.bucket(tx);
    const current = b.get(def.id);
    if (!current) throw new NotFoundError('CustomFieldDefinition', def.id);
    if (current.version !== expectedVersion) throw new PreconditionFailedError();
    b.set(def.id, copy(def));
  }
}
