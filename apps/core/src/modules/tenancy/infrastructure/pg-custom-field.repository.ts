import { CustomFieldDefinition, CustomFieldEntity, CustomFieldType, PiiClass } from '../../../kernel/custom-fields';
import { ConflictError, NotFoundError, PreconditionFailedError } from '../../../kernel/errors/domain-errors';
import { isPgTransaction, PgTransaction, Transaction } from '../../../kernel/persistence/unit-of-work';
import { CustomFieldRepository } from '../application/ports';

function pg(tx: Transaction): PgTransaction {
  if (!isPgTransaction(tx)) throw new Error('Postgres repository used outside a Postgres transaction');
  return tx;
}

interface Row {
  id: string; entity: CustomFieldEntity; key: string; label_en: string; label_hi: string | null; type: CustomFieldType;
  enum_options: CustomFieldDefinition['enumOptions'] | null; required: boolean; pii_class: PiiClass; reportable: boolean; active: boolean;
  created_at: Date; updated_at: Date; version: number;
}

const COLUMNS = 'id, entity, key, label_en, label_hi, type, enum_options, required, pii_class, reportable, active, created_at, updated_at, version';

function toDefinition(r: Row): CustomFieldDefinition {
  return {
    id: r.id,
    entity: r.entity,
    key: r.key,
    label: { en: r.label_en, ...(r.label_hi ? { hi: r.label_hi } : {}) },
    type: r.type,
    ...(r.enum_options ? { enumOptions: r.enum_options } : {}),
    required: r.required,
    piiClass: r.pii_class,
    reportable: r.reportable,
    version: r.version,
    active: r.active,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

/** Custom field definitions in the caller's RLS-scoped transaction (app.tenant_id is set by PgUnitOfWork). */
export class PgCustomFieldRepository implements CustomFieldRepository {
  async list(tx: Transaction): Promise<CustomFieldDefinition[]> {
    const { rows } = await pg(tx).query<Row>(`select ${COLUMNS} from custom_field_definition order by entity, key`);
    return rows.map(toDefinition);
  }

  async activeFor(tx: unknown, entity: CustomFieldEntity): Promise<CustomFieldDefinition[]> {
    const { rows } = await pg(tx as Transaction).query<Row>(`select ${COLUMNS} from custom_field_definition where entity = $1 and active order by key`, [entity]);
    return rows.map(toDefinition);
  }

  async get(tx: Transaction, id: string): Promise<CustomFieldDefinition | undefined> {
    const { rows } = await pg(tx).query<Row>(`select ${COLUMNS} from custom_field_definition where id = $1`, [id]);
    return rows[0] && toDefinition(rows[0]);
  }

  async insert(tx: Transaction, d: CustomFieldDefinition): Promise<void> {
    const { rowCount } = await pg(tx).query(
      `insert into custom_field_definition (tenant_id, ${COLUMNS}) values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, $13, $14, $15)
       on conflict (tenant_id, entity, key) do nothing`,
      [tx.tenantId, d.id, d.entity, d.key, d.label.en, d.label.hi ?? null, d.type, d.enumOptions ? JSON.stringify(d.enumOptions) : null,
        d.required, d.piiClass, d.reportable, d.active, d.createdAt, d.updatedAt, d.version]);
    if (rowCount === 0) throw new ConflictError('custom_field_exists', `Custom field ${d.key} already exists on ${d.entity}`);
  }

  async update(tx: Transaction, d: CustomFieldDefinition, expectedVersion: number): Promise<void> {
    const { rowCount } = await pg(tx).query(
      `update custom_field_definition set label_en = $2, label_hi = $3, enum_options = $4::jsonb, required = $5, reportable = $6, active = $7, updated_at = $8, version = $9
       where id = $1 and version = $10`,
      [d.id, d.label.en, d.label.hi ?? null, d.enumOptions ? JSON.stringify(d.enumOptions) : null, d.required, d.reportable, d.active, d.updatedAt, d.version, expectedVersion]);
    if (rowCount === 0) {
      if (!(await this.get(tx, d.id))) throw new NotFoundError('CustomFieldDefinition', d.id);
      throw new PreconditionFailedError();
    }
  }
}
