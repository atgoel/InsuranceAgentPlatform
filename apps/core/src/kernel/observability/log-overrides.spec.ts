import { LogOverrideStore } from './log-overrides';
import { FixedClock } from '../domain/clock';
import { SequentialIdGenerator } from '../domain/id-generator';
import { ValidationError } from '../errors/domain-errors';

describe('AC-M00-12 LogOverrideStore', () => {
  let clock: FixedClock;
  let ids: SequentialIdGenerator;
  let store: LogOverrideStore;

  beforeEach(() => {
    clock = new FixedClock(new Date('2026-01-01T00:00:00Z'));
    ids = new SequentialIdGenerator();
    store = new LogOverrideStore(clock, ids);
  });

  it('creates override with valid TTL', () => {
    const override = store.put({ scope: { tenantId: 'ten_123' }, ttlMinutes: 30, createdBy: 'usr_op' });
    expect(override.id).toBeDefined();
    expect(override.scope.tenantId).toBe('ten_123');
  });

  it('rejects TTL > 60 minutes', () => {
    expect(() => store.put({ scope: { tenantId: 'ten_123' }, ttlMinutes: 61, createdBy: 'op' })).toThrow(ValidationError);
  });

  it('rejects TTL < 1 minute', () => {
    expect(() => store.put({ scope: { tenantId: 'ten_123' }, ttlMinutes: 0, createdBy: 'op' })).toThrow(ValidationError);
  });

  it('rejects empty scope', () => {
    expect(() => store.put({ scope: {}, ttlMinutes: 10, createdBy: 'op' })).toThrow(ValidationError);
  });

  it('lists non-expired overrides', () => {
    store.put({ scope: { tenantId: 'ten_123' }, ttlMinutes: 30, createdBy: 'op' });
    const list = store.list();
    expect(list.length).toBeGreaterThan(0);
  });

  it('purges expired overrides on list', () => {
    const o1 = store.put({ scope: { tenantId: 'ten_1' }, ttlMinutes: 1, createdBy: 'op' });
    clock.advance(61000);
    const list = store.list();
    expect(list.find((o) => o.id === o1.id)).toBeUndefined();
  });

  it('checks if debug is enabled for scope', () => {
    store.put({ scope: { tenantId: 'ten_123', module: 'crm' }, ttlMinutes: 30, createdBy: 'op' });
    expect(store.isDebugEnabled({ tenantId: 'ten_123', module: 'crm' })).toBe(true);
    expect(store.isDebugEnabled({ tenantId: 'ten_456', module: 'crm' })).toBe(false);
  });

  it('removes override', () => {
    const o = store.put({ scope: { tenantId: 'ten_123' }, ttlMinutes: 30, createdBy: 'op' });
    expect(store.remove(o.id)).toBe(true);
    expect(store.remove(o.id)).toBe(false);
  });
});
