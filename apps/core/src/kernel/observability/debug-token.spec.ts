import { DebugTokenService } from './debug-token';
import { FixedClock } from '../domain/clock';
import { ValidationError } from '../errors/domain-errors';

describe('AC-M00-13 DebugTokenService', () => {
  let service: DebugTokenService;

  beforeEach(() => {
    service = new DebugTokenService('secret_key_at_least_32_chars_long', new FixedClock());
  });

  it('issues valid token', () => {
    const token = service.issue({ tenantId: 'ten_123', ttlMinutes: 10 });
    expect(typeof token).toBe('string');
  });

  it('rejects TTL > 15', () => {
    expect(() => service.issue({ tenantId: 'ten_123', ttlMinutes: 16 })).toThrow(ValidationError);
  });

  it('verifies valid token', () => {
    const token = service.issue({ tenantId: 'ten_123', ttlMinutes: 10 });
    expect(service.verify(token, 'ten_123')).toBe(true);
  });

  it('rejects token with wrong tenant', () => {
    const token = service.issue({ tenantId: 'ten_123', ttlMinutes: 10 });
    expect(service.verify(token, 'ten_456')).toBe(false);
  });

  it('rejects undefined token', () => {
    expect(service.verify(undefined, 'ten_123')).toBe(false);
  });
});
