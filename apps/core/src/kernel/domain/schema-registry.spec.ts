import { describe, it, expect } from '@jest/globals';
import { z } from 'zod';
import { SchemaRegistry } from './schema-registry';
import { ValidationError } from '../errors/domain-errors';

function thrown(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error('expected function to throw');
}

const v1 = { id: 'demo', version: 1, schema: z.object({ a: z.string() }), p2Paths: [] as string[] };
const v2 = { id: 'demo', version: 2, schema: z.object({ a: z.string(), b: z.number().int() }), p2Paths: ['a'] };

describe('AC-CR001-07 SchemaRegistry', () => {
  it('AC-CR001-07 registers versions and reports has/get', () => {
    const registry = new SchemaRegistry();
    registry.register(v1);
    expect(registry.has('demo', 1)).toBe(true);
    expect(registry.has('demo', 2)).toBe(false);
    expect(registry.get('demo', 1).version).toBe(1);
  });

  it('AC-CR001-07 refuses duplicate id+version, bad id and bad version', () => {
    const registry = new SchemaRegistry();
    registry.register(v1);
    expect(() => registry.register(v1)).toThrow('Schema already registered: demo@1');
    expect(() => registry.register({ ...v1, id: 'Bad-Id' })).toThrow('Invalid schema id: Bad-Id');
    expect(() => registry.register({ ...v1, version: 0 })).toThrow('Invalid schema version: 0');
    expect(() => registry.register({ ...v1, version: 1.5 })).toThrow('Invalid schema version: 1.5');
  });

  it('AC-CR001-07 latest returns the highest version', () => {
    const registry = new SchemaRegistry();
    registry.register(v2);
    registry.register(v1);
    expect(registry.latest('demo').version).toBe(2);
    expect(registry.latest('demo').p2Paths).toEqual(['a']);
  });

  it('AC-CR001-07 unknown schema throws unknown_schema with details', () => {
    const registry = new SchemaRegistry();
    const getErr = thrown(() => registry.get('nope', 3));
    expect(getErr).toBeInstanceOf(ValidationError);
    expect((getErr as ValidationError).code).toBe('unknown_schema');
    expect((getErr as ValidationError).details).toEqual({ schemaId: 'nope', version: 3 });
    expect((thrown(() => registry.latest('nope')) as ValidationError).code).toBe('unknown_schema');
    expect((thrown(() => registry.parse('nope', 1, {})) as ValidationError).code).toBe('unknown_schema');
  });

  it('AC-CR001-07 parse returns the parsed payload', () => {
    const registry = new SchemaRegistry();
    registry.register(v2);
    expect(registry.parse('demo', 2, { a: 'x', b: 3 })).toEqual({ a: 'x', b: 3 });
  });

  it('AC-CR001-07 parse reports issue paths and codes', () => {
    const registry = new SchemaRegistry();
    registry.register(v2);
    const error = thrown(() => registry.parse('demo', 2, { a: 1, b: 1.5 })) as ValidationError;
    expect(error.code).toBe('schema_validation_failed');
    expect(error.details).toEqual({ schemaId: 'demo', version: 2 });
    expect(error.errors.map((e) => `${e.path}:${e.code}`).sort()).toEqual(['a:invalid_type', 'b:invalid_type']);
  });
});
