import { Clock } from '../domain/clock';

export type IdempotencyBegin =
  | { state: 'new' }
  | { state: 'replay'; status: number; body: unknown }
  | { state: 'conflict' }
  | { state: 'in_progress' };

export interface IdempotencyStore {
  begin(tenantId: string, key: string, requestHash: string): Promise<IdempotencyBegin>;
  complete(tenantId: string, key: string, status: number, body: unknown): Promise<void>;
  release(tenantId: string, key: string): Promise<void>;
}

export { requestHash } from './idempotency.interceptor';

interface IdempotencyRecord {
  requestHash: string;
  status: 'in_progress' | 'completed';
  responseStatus?: number;
  responseBody?: unknown;
  createdAt: number;
  expiresAt: number;
}

/**
 * AC-M00-20 (idempotency): InMemoryIdempotencyStore
 * In-memory implementation of idempotency store.
 * Tracks in-flight requests and replays stored responses.
 * Records expire after TTL (default 24 hours).
 */
export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly records: Map<string, IdempotencyRecord> = new Map();
  private readonly ttlMs: number;

  constructor(private readonly clock: Clock, ttlMs?: number) {
    this.ttlMs = ttlMs ?? 24 * 60 * 60 * 1000; // 24 hours default
  }

  async begin(tenantId: string, key: string, requestHash: string): Promise<IdempotencyBegin> {
    const compositeKey = `${tenantId}:${key}`;
    const now = this.clock.now().getTime();

    // Clean up expired records
    const record = this.records.get(compositeKey);
    if (record && record.expiresAt < now) {
      this.records.delete(compositeKey);
      return { state: 'new' };
    }

    // No existing record
    if (!record) {
      this.records.set(compositeKey, {
        requestHash,
        status: 'in_progress',
        createdAt: now,
        expiresAt: now + this.ttlMs,
      });
      return { state: 'new' };
    }

    // Record exists: check state and request hash
    if (record.requestHash !== requestHash) {
      return { state: 'conflict' };
    }

    if (record.status === 'in_progress') {
      return { state: 'in_progress' };
    }

    // Completed with matching hash
    return {
      state: 'replay',
      status: record.responseStatus ?? 200,
      body: record.responseBody,
    };
  }

  async complete(tenantId: string, key: string, status: number, body: unknown): Promise<void> {
    const compositeKey = `${tenantId}:${key}`;
    const record = this.records.get(compositeKey);
    if (record) {
      record.status = 'completed';
      record.responseStatus = status;
      record.responseBody = body;
    }
  }

  async release(tenantId: string, key: string): Promise<void> {
    const compositeKey = `${tenantId}:${key}`;
    this.records.delete(compositeKey);
  }
}
export { PgIdempotencyStore } from './pg-idempotency-store';
