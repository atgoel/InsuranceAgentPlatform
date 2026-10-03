import { createHash } from 'node:crypto';

/** Deterministic JSON: object keys sorted at every depth, undefined members omitted (like JSON.stringify). */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortDeep(value)) ?? 'null';
}

export function sha256Hex(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value === null || typeof value !== 'object' || value instanceof Date) return value;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) out[key] = sortDeep((value as Record<string, unknown>)[key]);
  return out;
}
