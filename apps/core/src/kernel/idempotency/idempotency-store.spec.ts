import { FixedClock } from '../domain/clock';
import {
  InMemoryIdempotencyStore,
  requestHash,
} from './idempotency-store';

describe('idempotency-store (AC-M00-20)', () => {
  describe('InMemoryIdempotencyStore', () => {
    it('returns new state on first call with a key', async () => {
      const clock = new FixedClock();
      const store = new InMemoryIdempotencyStore(clock);

      const result = await store.begin(
        'ten_acme',
        'idempotency_key_123',
        'request_hash_abc',
      );

      expect(result.state).toBe('new');
    });

    it('returns replay state when the same key and request hash are submitted again', async () => {
      const clock = new FixedClock();
      const store = new InMemoryIdempotencyStore(clock);

      // First call
      await store.begin(
        'ten_acme',
        'idempotency_key_123',
        'request_hash_abc',
      );
      await store.complete('ten_acme', 'idempotency_key_123', 201, {
        id: 'lead_001',
      });

      // Second call with same key and hash
      const result = await store.begin(
        'ten_acme',
        'idempotency_key_123',
        'request_hash_abc',
      );

      expect(result.state).toBe('replay');
      if (result.state === 'replay') {
        expect(result.status).toBe(201);
        expect(result.body).toEqual({ id: 'lead_001' });
      }
    });

    it('returns conflict state when the same key with a different request hash is submitted', async () => {
      const clock = new FixedClock();
      const store = new InMemoryIdempotencyStore(clock);

      // First call
      await store.begin(
        'ten_acme',
        'idempotency_key_123',
        'request_hash_abc',
      );
      await store.complete('ten_acme', 'idempotency_key_123', 201, {
        id: 'lead_001',
      });

      // Second call with same key but different hash
      const result = await store.begin(
        'ten_acme',
        'idempotency_key_123',
        'request_hash_different',
      );

      expect(result.state).toBe('conflict');
    });

    it('returns in_progress state when a key is in flight', async () => {
      const clock = new FixedClock();
      const store = new InMemoryIdempotencyStore(clock);

      // First call
      await store.begin(
        'ten_acme',
        'idempotency_key_123',
        'request_hash_abc',
      );

      // Second call immediately (before first completes)
      const result = await store.begin(
        'ten_acme',
        'idempotency_key_123',
        'request_hash_abc',
      );

      expect(result.state).toBe('in_progress');
    });

    it('completes a request with status and body', async () => {
      const clock = new FixedClock();
      const store = new InMemoryIdempotencyStore(clock);

      await store.begin('ten_acme', 'key_123', 'hash_abc');
      await store.complete('ten_acme', 'key_123', 200, { result: 'success' });

      const result = await store.begin('ten_acme', 'key_123', 'hash_abc');

      expect(result.state).toBe('replay');
      if (result.state === 'replay') {
        expect(result.status).toBe(200);
        expect(result.body).toEqual({ result: 'success' });
      }
    });

    it('releases a key when a handler fails', async () => {
      const clock = new FixedClock();
      const store = new InMemoryIdempotencyStore(clock);

      // First call starts
      const result1 = await store.begin(
        'ten_acme',
        'key_123',
        'hash_abc',
      );
      expect(result1.state).toBe('new');

      // Handler fails, release the key
      await store.release('ten_acme', 'key_123');

      // Next call should see it as new again
      const result2 = await store.begin(
        'ten_acme',
        'key_123',
        'hash_abc',
      );
      expect(result2.state).toBe('new');
    });

    it('expires records after TTL', async () => {
      const clock = new FixedClock();
      const ttlMs = 3600000; // 1 hour
      const store = new InMemoryIdempotencyStore(clock, ttlMs);

      // First call
      await store.begin('ten_acme', 'key_123', 'hash_abc');
      await store.complete('ten_acme', 'key_123', 201, { id: 'lead_001' });

      // Advance clock past TTL
      clock.advance(ttlMs + 1000);

      // Record should be expired, should see as new
      const result = await store.begin('ten_acme', 'key_123', 'hash_abc');
      expect(result.state).toBe('new');
    });

    it('isolates records by tenant', async () => {
      const clock = new FixedClock();
      const store = new InMemoryIdempotencyStore(clock);

      // Tenant A starts
      await store.begin('ten_acme', 'key_123', 'hash_abc');
      await store.complete('ten_acme', 'key_123', 201, { id: 'lead_001' });

      // Tenant B with same key
      const result = await store.begin('ten_zen', 'key_123', 'hash_abc');

      expect(result.state).toBe('new');
    });
  });

  describe('requestHash', () => {
    it('generates a hash from method, route, and body', () => {
      const hash = requestHash('POST', '/api/v1/leads', {
        name: 'John',
      });

      expect(hash).toMatch(/^[0-9a-f]+$/);
    });

    it('generates the same hash for the same inputs', () => {
      const hash1 = requestHash('POST', '/api/v1/leads', {
        name: 'John',
      });
      const hash2 = requestHash('POST', '/api/v1/leads', {
        name: 'John',
      });

      expect(hash1).toBe(hash2);
    });

    it('generates different hashes for different methods', () => {
      const body = { name: 'John' };

      const hash1 = requestHash('POST', '/api/v1/leads', body);
      const hash2 = requestHash('PUT', '/api/v1/leads', body);

      expect(hash1).not.toBe(hash2);
    });

    it('generates different hashes for different routes', () => {
      const body = { name: 'John' };

      const hash1 = requestHash('POST', '/api/v1/leads', body);
      const hash2 = requestHash('POST', '/api/v1/parties', body);

      expect(hash1).not.toBe(hash2);
    });

    it('generates different hashes for different bodies', () => {
      const hash1 = requestHash('POST', '/api/v1/leads', {
        name: 'John',
      });
      const hash2 = requestHash('POST', '/api/v1/leads', {
        name: 'Jane',
      });

      expect(hash1).not.toBe(hash2);
    });
  });
});
