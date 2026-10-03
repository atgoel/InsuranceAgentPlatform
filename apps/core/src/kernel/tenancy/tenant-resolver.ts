import { ResolvedTenant } from '../config';

export interface TenantResolver {
  resolveByHost(host: string): Promise<ResolvedTenant | undefined>;
}

/**
 * AC-M00-18 (tenancy): StaticTenantResolver
 * Resolves tenants from a static configuration map.
 * Host is lowercased and port is stripped.
 */
export class StaticTenantResolver implements TenantResolver {
  constructor(private readonly map: Record<string, ResolvedTenant>) {}

  async resolveByHost(host: string): Promise<ResolvedTenant | undefined> {
    // Strip port and lowercase
    const hostWithoutPort = host.split(':')[0].toLowerCase();
    return this.map[hostWithoutPort];
  }
}
