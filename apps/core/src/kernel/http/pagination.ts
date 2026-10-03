import { z } from 'zod';
import { ValidationError } from '../errors/domain-errors';

export const PageQuerySchema = z.object({
  limit: z.number().int().min(1).max(100).default(25).optional(),
  cursor: z.string().optional(),
});

export interface Page<T> {
  items: T[];
  nextCursor?: string;
}

export function encodeCursor(value: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

export function decodeCursor(cursor: string): Record<string, unknown> {
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString();
    return JSON.parse(decoded);
  } catch {
    throw new ValidationError('invalid_cursor', 'Invalid cursor');
  }
}

/**
 * The row offset carried by an offset cursor (0 without a cursor). A forged or corrupt cursor is a 400
 * (`invalid_cursor`), never NaN or a negative number reaching a query.
 */
export function cursorOffset(cursor: string | undefined): number {
  if (!cursor) return 0;
  const offset = decodeCursor(cursor).offset ?? 0;
  if (typeof offset !== 'number' || !Number.isSafeInteger(offset) || offset < 0) throw new ValidationError('invalid_cursor', 'Invalid cursor');
  return offset;
}
