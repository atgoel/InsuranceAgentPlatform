import { DomainEvent, DomainEventFactory } from './domain-event';
import { FixedClock } from './clock';
import { SequentialIdGenerator } from './id-generator';
import { RequestContext } from '../observability/request-context';
import { ValidationError } from '../errors/domain-errors';

describe('AC-M00-05 DomainEvent & DomainEventFactory', () => {
  describe('DomainEvent shape', () => {
    it('has CloudEvents 1.0 structure', () => {
      const event: DomainEvent = {
        id: 'evt_123',
        specVersion: '1.0',
        type: 'crm.lead.created',
        source: 'crm',
        subject: 'lead_456',
        tenantId: 'ten_123',
        occurredAt: '2026-01-01T12:00:00Z',
        dataVersion: 1,
        data: { leadId: 'lead_456', phone: '+919876543210' },
      };

      expect(event.specVersion).toBe('1.0');
      expect(event.type).toBe('crm.lead.created');
      expect(event.data).toEqual({ leadId: 'lead_456', phone: '+919876543210' });
    });

    it('includes optional traceId from request context', () => {
      const event: DomainEvent = {
        id: 'evt_123',
        specVersion: '1.0',
        type: 'crm.lead.created',
        source: 'crm',
        subject: 'lead_456',
        tenantId: 'ten_123',
        occurredAt: '2026-01-01T12:00:00Z',
        dataVersion: 1,
        traceId: 'trace_abc123',
        data: {},
      };

      expect(event.traceId).toBe('trace_abc123');
    });
  });

  describe('DomainEventFactory', () => {
    let clock: FixedClock;
    let ids: SequentialIdGenerator;
    let factory: DomainEventFactory;

    beforeEach(() => {
      clock = new FixedClock(new Date('2026-01-01T12:00:00Z'));
      ids = new SequentialIdGenerator();
      factory = new DomainEventFactory(clock, ids);
    });

    it('creates event with factory-generated id', () => {
      const event = factory.create({
        type: 'crm.lead.created',
        source: 'crm',
        subject: 'lead_456',
        tenantId: 'ten_123',
        data: { leadId: 'lead_456' },
      });

      expect(event.id).toBe('evt_0001');
      expect(event.id).toMatch(/^evt_/);
    });

    it('generates sequential IDs', () => {
      const e1 = factory.create({
        type: 'crm.lead.created',
        source: 'crm',
        subject: 'lead_1',
        tenantId: 'ten_123',
        data: {},
      });

      const e2 = factory.create({
        type: 'crm.lead.created',
        source: 'crm',
        subject: 'lead_2',
        tenantId: 'ten_123',
        data: {},
      });

      expect(e1.id).toBe('evt_0001');
      expect(e2.id).toBe('evt_0002');
    });

    it('sets current clock time as occurredAt', () => {
      const event = factory.create({
        type: 'crm.lead.created',
        source: 'crm',
        subject: 'lead_456',
        tenantId: 'ten_123',
        data: {},
      });

      expect(event.occurredAt).toBe('2026-01-01T12:00:00.000Z');
    });

    it('sets specVersion to 1.0', () => {
      const event = factory.create({
        type: 'crm.lead.created',
        source: 'crm',
        subject: 'lead_456',
        tenantId: 'ten_123',
        data: {},
      });

      expect(event.specVersion).toBe('1.0');
    });

    it('defaults dataVersion to 1', () => {
      const event = factory.create({
        type: 'crm.lead.created',
        source: 'crm',
        subject: 'lead_456',
        tenantId: 'ten_123',
        data: {},
      });

      expect(event.dataVersion).toBe(1);
    });

    it('accepts custom dataVersion', () => {
      const event = factory.create({
        type: 'crm.lead.created',
        source: 'crm',
        subject: 'lead_456',
        tenantId: 'ten_123',
        data: {},
        dataVersion: 2,
      });

      expect(event.dataVersion).toBe(2);
    });

    it('preserves input data', () => {
      const data = { leadId: 'lead_456', phone: '+919876543210', score: 85 };
      const event = factory.create({
        type: 'crm.lead.created',
        source: 'crm',
        subject: 'lead_456',
        tenantId: 'ten_123',
        data,
      });

      expect(event.data).toEqual(data);
    });

    it('includes traceId from request context when present', () => {
      const ctx = RequestContext.create({ startedAtMs: 0, traceId: 'trace_from_context' });
      const event = RequestContext.run(ctx, () =>
        factory.create({
          type: 'crm.lead.created',
          source: 'crm',
          subject: 'lead_456',
          tenantId: 'ten_123',
          data: {},
        }),
      );

      expect(event.traceId).toBe('trace_from_context');
    });

    it('omits traceId when no request context', () => {
      const event = factory.create({
        type: 'crm.lead.created',
        source: 'crm',
        subject: 'lead_456',
        tenantId: 'ten_123',
        data: {},
      });

      expect(event.traceId).toBeUndefined();
    });
  });

  describe('type validation', () => {
    let factory: DomainEventFactory;

    beforeEach(() => {
      const clock = new FixedClock();
      const ids = new SequentialIdGenerator();
      factory = new DomainEventFactory(clock, ids);
    });

    it('accepts valid type format: module.entity.action', () => {
      const event = factory.create({
        type: 'crm.lead.created',
        source: 'crm',
        subject: 'lead_456',
        tenantId: 'ten_123',
        data: {},
      });

      expect(event.type).toBe('crm.lead.created');
    });

    it('accepts type with multiple underscores: module.entity_name.action', () => {
      const event = factory.create({
        type: 'crm.lead_status.changed',
        source: 'crm',
        subject: 'lead_456',
        tenantId: 'ten_123',
        data: {},
      });

      expect(event.type).toBe('crm.lead_status.changed');
    });

    it('rejects type not matching /^[a-z]+([.][a-z_]+){2}$/', () => {
      expect(() =>
        factory.create({
          type: 'CRM.lead.created', // Uppercase
          source: 'crm',
          subject: 'lead_456',
          tenantId: 'ten_123',
          data: {},
        }),
      ).toThrow(ValidationError);
    });

    it('rejects type with wrong number of parts', () => {
      expect(() =>
        factory.create({
          type: 'crm.lead', // Only 2 parts
          source: 'crm',
          subject: 'lead_456',
          tenantId: 'ten_123',
          data: {},
        }),
      ).toThrow(ValidationError);

      expect(() =>
        factory.create({
          type: 'crm.lead.status.changed', // 4 parts
          source: 'crm',
          subject: 'lead_456',
          tenantId: 'ten_123',
          data: {},
        }),
      ).toThrow(ValidationError);
    });

    it('rejects type with numeric parts', () => {
      expect(() =>
        factory.create({
          type: 'crm.lead1.created',
          source: 'crm',
          subject: 'lead_456',
          tenantId: 'ten_123',
          data: {},
        }),
      ).toThrow(ValidationError);
    });

    it('rejects type with hyphens', () => {
      expect(() =>
        factory.create({
          type: 'crm.lead-status.changed',
          source: 'crm',
          subject: 'lead_456',
          tenantId: 'ten_123',
          data: {},
        }),
      ).toThrow(ValidationError);
    });
  });

  describe('immutability', () => {
    it('created event is immutable', () => {
      const clock = new FixedClock();
      const ids = new SequentialIdGenerator();
      const factory = new DomainEventFactory(clock, ids);

      const event = factory.create({
        type: 'crm.lead.created',
        source: 'crm',
        subject: 'lead_456',
        tenantId: 'ten_123',
        data: { leadId: 'lead_456' },
      });
      expect(Object.isFrozen(event)).toBe(true);
    });
  });
});
