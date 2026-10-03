import { describe, it, expect } from 'vitest';
import { hasPermission } from './me';

describe('AC-M00-19 web hasPermission', () => {
  it('matches exact and prefix wildcard grants only', () => {
    expect(hasPermission(['tenant.custom_field.write'], 'tenant.custom_field.write')).toBe(true);
    expect(hasPermission(['tenant.*'], 'tenant.custom_field.write')).toBe(true);
    expect(hasPermission(['tenant.custom_field.*'], 'tenant.custom_field.write')).toBe(true);
    expect(hasPermission(['crm.*'], 'tenant.custom_field.write')).toBe(false);
    expect(hasPermission(['tenant.read'], 'tenant.custom_field.write')).toBe(false);
    expect(hasPermission(['tenantx.*'], 'tenant.custom_field.write')).toBe(false);
    expect(hasPermission([], 'party.write')).toBe(false);
  });
});
