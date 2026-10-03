import { randomUUID } from 'node:crypto';

/** A fresh Idempotency-Key for POSTs that the spec marks ✱ (04-api §1). */
export function newIdempotencyKey(): string {
  return `test-${randomUUID()}`;
}
