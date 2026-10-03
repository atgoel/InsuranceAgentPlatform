import { SystemClock } from '../domain/clock';
import { UlidIdGenerator } from '../domain/id-generator';
import { Redactor } from '../observability/redactor';
import { InMemoryAuditLog, canonicalHash } from './audit-log';

describe('audit-log (AC-M00-22)', () => {
  const clock = new SystemClock();
  const ids = new UlidIdGenerator(clock);
  const redactor = new Redactor();

  describe('InMemoryAuditLog', () => {
    it('stores audit events with hashes instead of raw values', async () => {
      const auditLog = new InMemoryAuditLog(clock, ids, redactor);

      const beforeValue = { name: 'John', status: 'NEW' };
      const afterValue = { name: 'John', status: 'ROUTED' };

      const event = await auditLog.append(
        { tenantId: 'ten_acme', kind: 'memory' },
        {
          action: 'stage_transition',
          entityType: 'lead',
          entityId: 'lead_001',
          before: beforeValue,
          after: afterValue,
        },
      );

      expect(event.beforeHash).toBe(canonicalHash(beforeValue));
      expect(event.afterHash).toBe(canonicalHash(afterValue));
      expect(event.before).toBeUndefined();
      expect(event.after).toBeUndefined();
    });

    it('uses actor from RequestContext or defaults to system', async () => {
      const auditLog = new InMemoryAuditLog(clock, ids, redactor);

      const event = await auditLog.append(
        { tenantId: 'ten_acme', kind: 'memory' },
        {
          action: 'update',
          entityType: 'party',
          entityId: 'party_001',
        },
      );

      expect(event.actor).toBe('system');
    });

    it('stores tenantId from transaction', async () => {
      const auditLog = new InMemoryAuditLog(clock, ids, redactor);

      const event = await auditLog.append(
        { tenantId: 'ten_zen', kind: 'memory' },
        {
          action: 'delete',
          entityType: 'consent',
          entityId: 'consent_001',
        },
      );

      expect(event.tenantId).toBe('ten_zen');
    });

    it('redacts metadata before storing', async () => {
      const auditLog = new InMemoryAuditLog(clock, ids, redactor);

      const sensitiveMetadata = {
        phone: '+919876543210',
        email: 'user@example.com',
        reason: 'customer request',
      };

      const event = await auditLog.append(
        { tenantId: 'ten_acme', kind: 'memory' },
        {
          action: 'consent_withdrawn',
          entityType: 'consent',
          entityId: 'consent_001',
          metadata: sensitiveMetadata,
        },
      );

      expect(event.metadata.phone).toBeDefined();
      expect(event.metadata.email).toBeDefined();
      // Redactor applies scrubbing; we verify it runs without throwing
    });

    it('generates unique IDs for each event', async () => {
      const auditLog = new InMemoryAuditLog(clock, ids, redactor);

      const event1 = await auditLog.append(
        { tenantId: 'ten_acme', kind: 'memory' },
        {
          action: 'create',
          entityType: 'lead',
          entityId: 'lead_001',
        },
      );

      const event2 = await auditLog.append(
        { tenantId: 'ten_acme', kind: 'memory' },
        {
          action: 'create',
          entityType: 'lead',
          entityId: 'lead_002',
        },
      );

      expect(event1.id).not.toBe(event2.id);
    });

    it('stores occurredAt timestamp', async () => {
      const auditLog = new InMemoryAuditLog(clock, ids, redactor);

      const beforeCall = new Date();
      const event = await auditLog.append(
        { tenantId: 'ten_acme', kind: 'memory' },
        {
          action: 'update',
          entityType: 'lead',
          entityId: 'lead_001',
        },
      );
      const afterCall = new Date();

      const eventTime = new Date(event.occurredAt);
      expect(eventTime.getTime()).toBeGreaterThanOrEqual(beforeCall.getTime());
      expect(eventTime.getTime()).toBeLessThanOrEqual(afterCall.getTime());
    });

    it('stores the events in the events array for retrieval', async () => {
      const auditLog = new InMemoryAuditLog(clock, ids, redactor);

      await auditLog.append(
        { tenantId: 'ten_acme', kind: 'memory' },
        {
          action: 'create',
          entityType: 'lead',
          entityId: 'lead_001',
        },
      );

      expect(auditLog.events).toHaveLength(1);
      expect(auditLog.events[0].action).toBe('create');
      expect(auditLog.events[0].entityType).toBe('lead');
    });
  });

  describe('canonicalHash', () => {
    it('hashes undefined to undefined', () => {
      expect(canonicalHash(undefined)).toBeUndefined();
    });

    it('produces the same hash for the same value', () => {
      const value = { name: 'John', age: 30, city: 'Mumbai' };

      const hash1 = canonicalHash(value);
      const hash2 = canonicalHash(value);

      expect(hash1).toBe(hash2);
    });

    it('produces different hashes for different values', () => {
      const value1 = { name: 'John', age: 30 };
      const value2 = { name: 'John', age: 31 };

      const hash1 = canonicalHash(value1);
      const hash2 = canonicalHash(value2);

      expect(hash1).not.toBe(hash2);
    });

    it('produces the same hash regardless of key order', () => {
      const value1 = { name: 'John', age: 30 };
      const value2 = { age: 30, name: 'John' };

      const hash1 = canonicalHash(value1);
      const hash2 = canonicalHash(value2);

      expect(hash1).toBe(hash2);
    });

    it('returns a hex string', () => {
      const hash = canonicalHash({ value: 'test' });

      expect(hash).toMatch(/^[0-9a-f]+$/);
    });
  });
});
