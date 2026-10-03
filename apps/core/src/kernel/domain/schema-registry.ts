import { ZodType } from 'zod';
import { ValidationError } from '../errors/domain-errors';

export interface RegisteredSchema<T = unknown> {
  id: string;
  version: number;
  schema: ZodType<T>;
  /** Top-level keys holding P2 data (encrypted by the owning repository, masked in lists). */
  p2Paths: readonly string[];
}

const ID_PATTERN = /^[a-z][a-z0-9_]{1,39}$/;

/** Versioned JSONB payload schemas (risk details etc.). Registration happens at boot. */
export class SchemaRegistry {
  private readonly entries = new Map<string, RegisteredSchema>();

  register<T>(entry: RegisteredSchema<T>): void {
    if (!ID_PATTERN.test(entry.id)) throw new Error(`Invalid schema id: ${entry.id}`);
    if (!Number.isInteger(entry.version) || entry.version < 1) throw new Error(`Invalid schema version: ${entry.version}`);
    const key = SchemaRegistry.key(entry.id, entry.version);
    if (this.entries.has(key)) throw new Error(`Schema already registered: ${key}`);
    this.entries.set(key, entry as RegisteredSchema);
  }

  has(id: string, version: number): boolean {
    return this.entries.has(SchemaRegistry.key(id, version));
  }

  get(id: string, version: number): RegisteredSchema {
    const found = this.entries.get(SchemaRegistry.key(id, version));
    if (!found) throw new ValidationError('unknown_schema', `Unknown schema ${id}@${version}`, [], { schemaId: id, version });
    return found;
  }

  latest(id: string): RegisteredSchema {
    let best: RegisteredSchema | undefined;
    for (const entry of this.entries.values()) {
      if (entry.id === id && (!best || entry.version > best.version)) best = entry;
    }
    if (!best) throw new ValidationError('unknown_schema', `Unknown schema ${id}`, [], { schemaId: id });
    return best;
  }

  parse<T = unknown>(id: string, version: number, payload: unknown): T {
    const entry = this.get(id, version);
    const result = entry.schema.safeParse(payload);
    if (result.success) return result.data as T;
    const errors = result.error.issues.map((issue) => ({ path: issue.path.join('.'), code: issue.code, message: issue.message }));
    throw new ValidationError('schema_validation_failed', `Payload does not match ${id}@${version}`, errors, { schemaId: id, version });
  }

  private static key(id: string, version: number): string {
    return `${id}@${version}`;
  }
}
