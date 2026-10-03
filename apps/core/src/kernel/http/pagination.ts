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
